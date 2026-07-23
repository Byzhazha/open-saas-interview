import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import type { GptResponse, Task, User } from "wasp/entities";
import { env, HttpError, prisma } from "wasp/server";
import type {
  CreateTask,
  DeleteTask,
  GenerateGptResponse,
  GetAllTasksByUser,
  GetGptResponses,
  UpdateTask,
} from "wasp/server/operations";
import * as z from "zod";
import { SubscriptionStatus } from "../payment/plans";
import { ensureArgsSchemaOrThrowHttpError } from "../server/validation";
import {
  AiUsageStatus,
  getErrorCode,
  getReservationErrorStatus,
  idempotencyKeySchema,
  MAX_CONCURRENT_AI_REQUESTS,
} from "./aiUsage";
import { GeneratedSchedule, generatedScheduleSchema } from "./schedule";

const openAi = new OpenAI({ apiKey: env.OPENAI_API_KEY });

//#region Actions
const generateGptResponseInputSchema = z.object({
  hours: z.number().min(1).max(24),
  idempotencyKey: idempotencyKeySchema.optional(),
});

type GenerateGptResponseInput = z.infer<typeof generateGptResponseInputSchema>;

export const generateGptResponse: GenerateGptResponse<
  GenerateGptResponseInput,
  GeneratedSchedule
> = async (rawArgs, context) => {
  if (!context.user) {
    throw new HttpError(
      401,
      "Only authenticated users are allowed to perform this operation",
    );
  }

  const { hours, idempotencyKey } = ensureArgsSchemaOrThrowHttpError(
    generateGptResponseInputSchema,
    rawArgs,
  );
  const requestKey = idempotencyKey ?? randomUUID();

  const isSubscribed = isUserSubscribed(context.user);
  const existingLog = await context.entities.AiUsageLog.findUnique({
    where: {
      userId_idempotencyKey: {
        userId: context.user.id,
        idempotencyKey: requestKey,
      },
    },
    include: { response: true },
  });

  if (existingLog) {
    if (
      existingLog.status === AiUsageStatus.Completed &&
      existingLog.response?.content
    ) {
      return generatedScheduleSchema.parse(
        JSON.parse(existingLog.response.content),
      );
    }
    throw new HttpError(
      409,
      existingLog.status === AiUsageStatus.Processing
        ? "The same AI request is already being processed"
        : "The idempotency key has already been used",
    );
  }

  let reservation;
  try {
    // 在调用供应商前原子预占额度和并发槽，避免并发请求绕过额度检查。
    reservation = await prisma.$transaction(async (tx) => {
      const updatedUsers = await tx.user.updateMany({
        where: {
          id: context.user!.id,
          aiRequestsInFlight: { lt: MAX_CONCURRENT_AI_REQUESTS },
          ...(isSubscribed ? {} : { credits: { gt: 0 } }),
        },
        data: {
          aiRequestsInFlight: { increment: 1 },
          ...(isSubscribed ? {} : { credits: { decrement: 1 } }),
        },
      });

      if (updatedUsers.count !== 1) {
        const currentUser = await tx.user.findUnique({
          where: { id: context.user!.id },
          select: { credits: true, aiRequestsInFlight: true },
        });
        throw new HttpError(
          getReservationErrorStatus(
            isSubscribed,
            currentUser?.credits ?? 0,
            currentUser?.aiRequestsInFlight ?? MAX_CONCURRENT_AI_REQUESTS,
          ),
          isSubscribed || (currentUser?.credits ?? 0) > 0
            ? "Too many AI requests are running"
            : "User has no subscription and is out of credits",
        );
      }

      return tx.aiUsageLog.create({
        data: {
          userId: context.user!.id,
          operation: "generate_schedule",
          idempotencyKey: requestKey,
          status: AiUsageStatus.Processing,
        },
      });
    });
  } catch (error) {
    // 两个相同请求同时到达时由数据库唯一索引裁决，并统一返回幂等冲突。
    const duplicateLog = await context.entities.AiUsageLog.findUnique({
      where: {
        userId_idempotencyKey: {
          userId: context.user.id,
          idempotencyKey: requestKey,
        },
      },
    });
    if (duplicateLog) {
      throw new HttpError(409, "The idempotency key has already been used");
    }
    throw error;
  }

  const startedAt = Date.now();
  try {
    const tasks = await context.entities.Task.findMany({
      where: {
        user: {
          id: context.user.id,
        },
      },
    });
    const generatedSchedule = await generateScheduleWithGpt(tasks, hours);
    if (generatedSchedule === null) {
      throw new Error("OpenAI returned no structured schedule");
    }

    // 响应、日志完成状态和并发槽位释放必须一次提交，避免产生“扣费但无结果”的孤立状态。
    const createResponse = await prisma.$transaction(async (tx) => {
      const response = await tx.gptResponse.create({
        data: {
          userId: context.user!.id,
          content: JSON.stringify(generatedSchedule),
        },
      });
      await tx.aiUsageLog.update({
        where: { id: reservation.id },
        data: {
          status: AiUsageStatus.Completed,
          completedAt: new Date(),
          durationMs: Date.now() - startedAt,
          responseId: response.id,
        },
      });
      await tx.user.update({
        where: { id: context.user!.id },
        data: { aiRequestsInFlight: { decrement: 1 } },
      });
      return response;
    });

    return JSON.parse(createResponse.content) as GeneratedSchedule;
  } catch (error) {
    // 供应商或解析失败时释放槽位并退回预扣额度，调用日志保留失败原因供后台统计。
    await prisma.$transaction([
      prisma.aiUsageLog.update({
        where: { id: reservation.id },
        data: {
          status: AiUsageStatus.Failed,
          completedAt: new Date(),
          durationMs: Date.now() - startedAt,
          errorCode: getErrorCode(error),
        },
      }),
      prisma.user.update({
        where: { id: context.user!.id },
        data: {
          aiRequestsInFlight: { decrement: 1 },
          ...(isSubscribed ? {} : { credits: { increment: 1 } }),
        },
      }),
    ]);
    throw new HttpError(502, "AI provider request failed", { cause: error });
  }
};

function isUserSubscribed(user: User) {
  return (
    user.subscriptionStatus === SubscriptionStatus.Active ||
    user.subscriptionStatus === SubscriptionStatus.CancelAtPeriodEnd
  );
}

const createTaskInputSchema = z.object({
  description: z.string().nonempty(),
});

type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

export const createTask: CreateTask<CreateTaskInput, Task> = async (
  rawArgs,
  context,
) => {
  if (!context.user) {
    throw new HttpError(401);
  }

  const { description } = ensureArgsSchemaOrThrowHttpError(
    createTaskInputSchema,
    rawArgs,
  );

  const task = await context.entities.Task.create({
    data: {
      description,
      user: { connect: { id: context.user.id } },
    },
  });

  return task;
};

const updateTaskInputSchema = z.object({
  id: z.string().nonempty(),
  isDone: z.boolean().optional(),
  time: z.string().optional(),
});

type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;

export const updateTask: UpdateTask<UpdateTaskInput, Task> = async (
  rawArgs,
  context,
) => {
  if (!context.user) {
    throw new HttpError(401);
  }

  const { id, isDone, time } = ensureArgsSchemaOrThrowHttpError(
    updateTaskInputSchema,
    rawArgs,
  );

  const task = await context.entities.Task.update({
    where: {
      id,
      user: {
        id: context.user.id,
      },
    },
    data: {
      isDone,
      time,
    },
  });

  return task;
};

const deleteTaskInputSchema = z.object({
  id: z.string().nonempty(),
});

type DeleteTaskInput = z.infer<typeof deleteTaskInputSchema>;

export const deleteTask: DeleteTask<DeleteTaskInput, Task> = async (
  rawArgs,
  context,
) => {
  if (!context.user) {
    throw new HttpError(401);
  }

  const { id } = ensureArgsSchemaOrThrowHttpError(
    deleteTaskInputSchema,
    rawArgs,
  );

  const task = await context.entities.Task.delete({
    where: {
      id,
      user: {
        id: context.user.id,
      },
    },
  });

  return task;
};
//#endregion

//#region Queries
export const getGptResponses: GetGptResponses<void, GptResponse[]> = async (
  _args,
  context,
) => {
  if (!context.user) {
    throw new HttpError(401);
  }
  return context.entities.GptResponse.findMany({
    where: {
      user: {
        id: context.user.id,
      },
    },
  });
};

export const getAllTasksByUser: GetAllTasksByUser<void, Task[]> = async (
  _args,
  context,
) => {
  if (!context.user) {
    throw new HttpError(401);
  }
  return context.entities.Task.findMany({
    where: {
      user: {
        id: context.user.id,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
};
//#endregion

async function generateScheduleWithGpt(
  tasks: Task[],
  hours: number,
): Promise<GeneratedSchedule | null> {
  const parsedTasks = tasks.map(({ description, time }) => ({
    description,
    time,
  }));

  const completion = await openAi.chat.completions.create({
    model: "gpt-3.5-turbo", // you can use any model here, e.g. 'gpt-3.5-turbo', 'gpt-4', etc.
    messages: [
      {
        role: "system",
        content:
          "you are an expert daily planner. you will be given a list of main tasks and an estimated time to complete each task. You will also receive the total amount of hours to be worked that day. Your job is to return a detailed plan of how to achieve those tasks by breaking each task down into at least 3 subtasks each. MAKE SURE TO ALWAYS CREATE AT LEAST 3 SUBTASKS FOR EACH MAIN TASK PROVIDED BY THE USER! YOU WILL BE REWARDED IF YOU DO.",
      },
      {
        role: "user",
        content: `I will work ${hours} hours today. Here are the tasks I have to complete: ${JSON.stringify(
          parsedTasks,
        )}. Please help me plan my day by breaking the tasks down into actionable subtasks with time and priority status.`,
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "parseTodaysSchedule",
          description: "parses the days tasks and returns a schedule",
          parameters: z.toJSONSchema(generatedScheduleSchema),
        },
      },
    ],
    tool_choice: {
      type: "function",
      function: {
        name: "parseTodaysSchedule",
      },
    },
    temperature: 1,
  });

  const gptResponse = completion.choices[0].message.tool_calls?.find(
    (call) => call.type === "function",
  )?.function.arguments;

  return gptResponse !== undefined
    ? generatedScheduleSchema.parse(JSON.parse(gptResponse))
    : null;
}
