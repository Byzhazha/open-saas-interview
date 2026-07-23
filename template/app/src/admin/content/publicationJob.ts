import type { SyncCmsPublicationJob } from "wasp/server/jobs";
import { writePublishedCmsArtifacts } from "./publication";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;
const STALE_AFTER_MS = 5 * 60 * 1000;

/** 发布事件使用数据库状态机，确保进程重启后仍能继续生成 Astro 静态产物。 */
export const syncCmsPublicationJob: SyncCmsPublicationJob<never, void> = async (
  _args,
  context,
) => {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);

  await context.entities.CmsPublicationEvent.updateMany({
    where: {
      status: "processing",
      updatedAt: { lt: staleBefore },
      attempts: { lt: MAX_ATTEMPTS },
    },
    data: { status: "pending", availableAt: now },
  });

  const events = await context.entities.CmsPublicationEvent.findMany({
    where: {
      status: "pending",
      attempts: { lt: MAX_ATTEMPTS },
      availableAt: { lte: now },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: BATCH_SIZE,
  });

  for (const event of events) {
    const claimed = await context.entities.CmsPublicationEvent.updateMany({
      where: { id: event.id, status: "pending", attempts: event.attempts },
      data: {
        status: "processing",
        attempts: { increment: 1 },
        errorMessage: null,
      },
    });
    if (claimed.count !== 1) continue;

    try {
      await writePublishedCmsArtifacts();
      await context.entities.CmsPublicationEvent.update({
        where: { id: event.id },
        data: { status: "completed", processedAt: new Date() },
      });
    } catch (error) {
      const attempts = event.attempts + 1;
      const retryable = attempts < MAX_ATTEMPTS;
      await context.entities.CmsPublicationEvent.update({
        where: { id: event.id },
        data: {
          status: retryable ? "pending" : "failed",
          availableAt: new Date(
            Date.now() + Math.min(60 * 60 * 1000, 2 ** attempts * 60 * 1000),
          ),
          errorMessage: getErrorMessage(error),
        },
      });
    }
  }
};

function getErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}
