import { expect, test } from "@playwright/test";
import { createRandomUser, logUserIn, signUserUp } from "./utils";

test("user can save an animation and complete or retry a video conversion", async ({
  page,
}) => {
  test.slow();
  const user = createRandomUser();
  await signUserUp({ page, user });
  await logUserIn({ page, user });

  await page.goto("/animations");
  await expect(
    page.getByRole("heading", { name: "HTML Animation Studio" }),
  ).toBeVisible();

  await page.getByTestId("animation-title").fill(`E2E animation ${user.email}`);
  await page.getByTestId("animation-html").fill(`
    <style>
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      body { background: #102a43; }
      .frame { width: 100vw; height: 100vh; display: grid; place-items: center; }
      .box { width: 96px; height: 96px; background: #7dd3fc; animation: move 1s linear infinite alternate; }
      @keyframes move { to { transform: translateX(120px) rotate(25deg); } }
    </style>
    <div class="frame"><div class="box"></div></div>
  `);
  await page.getByTestId("save-animation").click();
  await expect(page.getByTestId("queue-video")).toBeEnabled();

  await page.getByTestId("video-format").selectOption("webm");
  await page.getByTestId("video-duration").fill("2");
  await page.getByTestId("video-fps").fill("24");
  await page.getByTestId("queue-video").click();

  const job = page.locator('[data-testid^="video-job-"]').first();
  await expect(job).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      async () => {
        const status = await job.getByTestId("video-job-status").innerText();
        return status.split(" ")[0];
      },
      { timeout: 120_000, intervals: [1_000, 3_000, 5_000] },
    )
    .toMatch(/completed|failed/);
  const terminalStatus = (
    await job.getByTestId("video-job-status").innerText()
  ).split(" ")[0];

  if (terminalStatus === "completed") {
    const downloadResponse = page.waitForResponse(
      (response) =>
        response.url().includes("get-animation-video-download-url") &&
        response.status() === 200,
    );
    await job.getByTestId("video-download").click();
    await downloadResponse;
  } else {
    await expect(job.getByTestId("video-job-status")).toContainText("failed");
    const retryButton = job.getByTestId("video-retry");
    await expect(retryButton).toBeVisible();
    await retryButton.click();
    await expect
      .poll(
        async () =>
          (await job.getByTestId("video-job-status").innerText()).split(" ")[0],
        { timeout: 30_000 },
      )
      .toMatch(/queued|processing|completed|failed/);
  }
});
