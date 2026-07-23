import { useEffect, useState, type ReactNode } from "react";
import {
  createAnimation,
  getAnimationVideoDownloadURL,
  getAnimationVideoJobs,
  getAnimations,
  retryAnimationVideo,
  requestAnimationVideo,
  useQuery,
} from "wasp/client/operations";
import { Button } from "../client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../client/components/ui/card";
import { Input } from "../client/components/ui/input";
import { Label } from "../client/components/ui/label";
import { Textarea } from "../client/components/ui/textarea";

type AnimationRecord = { id: string; title: string; htmlContent: string };
type VideoJob = {
  id: string;
  animationId: string;
  format: "mp4" | "webm";
  status: "queued" | "processing" | "completed" | "failed";
  durationSeconds: number;
  fps: number;
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  animation: { id: string; title: string };
};

const emptyHtml = `<div class="stage"><div class="orb"></div></div>
<style>
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
  .stage { display: grid; place-items: center; width: 100vw; height: 100vh; background: #101827; }
  .orb { width: 120px; height: 120px; border-radius: 50%; background: #76e4f7; animation: drift 3s ease-in-out infinite alternate; }
  @keyframes drift { to { transform: translate(240px, -80px) scale(1.5); background: #f6ad55; } }
</style>`;

export function AnimationPage() {
  const animationsQuery = useQuery(getAnimations);
  const jobsQuery = useQuery(getAnimationVideoJobs);
  const animations = (animationsQuery.data ?? []) as AnimationRecord[];
  const jobs = (jobsQuery.data ?? []) as VideoJob[];
  const [selectedId, setSelectedId] = useState<string>("");
  const [title, setTitle] = useState("Demo animation");
  const [htmlContent, setHtmlContent] = useState(emptyHtml);
  const [format, setFormat] = useState<"mp4" | "webm">("mp4");
  const [durationSeconds, setDurationSeconds] = useState(5);
  const [fps, setFps] = useState(30);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => {
      void jobsQuery.refetch();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [jobsQuery]);

  const saveAnimation = async () => {
    try {
      setError("");
      setIsSaving(true);
      const animation = await createAnimation({ title, htmlContent });
      setSelectedId(animation.id);
      await animationsQuery.refetch();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save animation",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const queueVideo = async () => {
    if (!selectedId) {
      setError("Save an animation before converting it");
      return;
    }
    try {
      setError("");
      setIsSaving(true);
      await requestAnimationVideo({
        animationId: selectedId,
        format,
        durationSeconds,
        fps,
      });
      await jobsQuery.refetch();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to queue video conversion",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold">HTML Animation Studio</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Save an HTML animation, preview it, and export MP4 or WebM in the
          background.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Animation source</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Saved animation">
              <select
                className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                value={selectedId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  const nextAnimation = animations.find(
                    (item) => item.id === nextId,
                  );
                  setSelectedId(nextId);
                  setTitle(nextAnimation?.title ?? "Demo animation");
                  setHtmlContent(nextAnimation?.htmlContent ?? emptyHtml);
                }}
              >
                <option value="">New animation</option>
                {animations.map((animation) => (
                  <option key={animation.id} value={animation.id}>
                    {animation.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <Field label="HTML / CSS / JavaScript">
              <Textarea
                className="min-h-72 font-mono text-xs"
                value={htmlContent}
                onChange={(event) => setHtmlContent(event.target.value)}
              />
            </Field>
            <Button onClick={saveAnimation} disabled={isSaving}>
              {selectedId ? "Save animation" : "Save new animation"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <iframe
              title="Animation preview"
              srcDoc={htmlContent}
              sandbox="allow-scripts"
              className="aspect-video w-full rounded-sm border"
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Format">
                <select
                  className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                  value={format}
                  onChange={(event) =>
                    setFormat(event.target.value as "mp4" | "webm")
                  }
                >
                  <option value="mp4">MP4</option>
                  <option value="webm">WebM</option>
                </select>
              </Field>
              <Field label="Seconds">
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={durationSeconds}
                  onChange={(event) =>
                    setDurationSeconds(Number(event.target.value))
                  }
                />
              </Field>
              <Field label="FPS">
                <Input
                  type="number"
                  min={12}
                  max={60}
                  value={fps}
                  onChange={(event) => setFps(Number(event.target.value))}
                />
              </Field>
            </div>
            <Button onClick={queueVideo} disabled={isSaving || !selectedId}>
              Queue video conversion
            </Button>
            {error && <p className="text-destructive text-sm">{error}</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conversion jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobs.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No conversion jobs yet.
            </p>
          )}
          {jobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              onRetry={async () => {
                await retryAnimationVideo({ jobId: job.id });
                await jobsQuery.refetch();
              }}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function JobRow({
  job,
  onRetry,
}: {
  job: VideoJob;
  onRetry: () => Promise<void>;
}) {
  const downloadQuery = useQuery(
    getAnimationVideoDownloadURL,
    { jobId: job.id },
    { enabled: false },
  );

  const download = async () => {
    const result = await downloadQuery.refetch();
    if (result.data) {
      window.open(result.data, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="border-border flex flex-wrap items-center justify-between gap-3 rounded-sm border p-3">
      <div>
        <p className="font-medium">
          {job.animation.title} · {job.format.toUpperCase()}
        </p>
        <p className="text-muted-foreground text-xs">
          {job.status} · attempt {job.attempts}/{job.maxAttempts}
          {job.errorMessage ? ` · ${job.errorMessage}` : ""}
        </p>
      </div>
      <div className="flex gap-2">
        {job.status === "completed" && (
          <Button variant="outline" size="sm" onClick={download}>
            Download
          </Button>
        )}
        {job.status === "failed" && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
