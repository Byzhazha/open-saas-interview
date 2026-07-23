import { useMemo, useState } from "react";
import { type AuthUser } from "wasp/auth";
import {
  getAiUsageLogs,
  getAiUsageStats,
  useQuery,
} from "wasp/client/operations";
import { Button } from "../../../client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../client/components/ui/card";
import { DefaultLayout } from "../../layout/DefaultLayout";

type Period = "today" | "7d" | "30d";
type Status = "processing" | "completed" | "failed";

const periods: Array<{ value: Period; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

function formatCost(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}

function formatDate(value: string | Date): string {
  return new Date(value).toLocaleString();
}

/** 管理员页面统一展示 token 和微美元，避免前端重新推算供应商成本。 */
export function AiUsageDashboardPage({ user }: { user: AuthUser }) {
  const [period, setPeriod] = useState<Period>("7d");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<Status | "">("");
  const statsQuery = useQuery(getAiUsageStats, { period });
  const logsQuery = useQuery(getAiUsageLogs, {
    page,
    pageSize: 20,
    ...(status ? { status } : {}),
  });

  const stats = statsQuery.data;
  const logs = logsQuery.data;
  const operationRows = useMemo(
    () => stats?.byOperation ?? [],
    [stats?.byOperation],
  );

  return (
    <DefaultLayout user={user}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">AI usage</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Token consumption, estimated cost, and request outcomes.
            </p>
          </div>
          <select
            aria-label="Statistics period"
            className="border-input bg-background h-10 rounded-md border px-3 text-sm"
            value={period}
            onChange={(event) => setPeriod(event.target.value as Period)}
          >
            {periods.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        {statsQuery.error && (
          <p className="text-destructive text-sm">{statsQuery.error.message}</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Calls" value={stats?.totalCalls ?? 0} />
          <MetricCard label="Tokens" value={stats?.totalTokens ?? 0} />
          <MetricCard
            label="Estimated cost"
            value={formatCost(stats?.estimatedCostMicros ?? 0)}
          />
          <MetricCard
            label="Failed calls"
            value={`${stats?.failedCalls ?? 0} / ${stats?.totalCalls ?? 0}`}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>By operation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-border divide-y">
              {operationRows.length === 0 && (
                <p className="text-muted-foreground py-4 text-sm">
                  No AI usage in this period.
                </p>
              )}
              {operationRows.map((row) => (
                <div
                  key={row.operation}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                >
                  <span className="font-medium">{row.operation}</span>
                  <span className="text-muted-foreground">
                    {row.calls} calls · {row.tokens.toLocaleString()} tokens ·{" "}
                    {formatCost(row.estimatedCostMicros)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent calls</CardTitle>
            <select
              aria-label="Usage status"
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value as Status | "");
              }}
            >
              <option value="">All statuses</option>
              <option value="completed">Completed</option>
              <option value="processing">Processing</option>
              <option value="failed">Failed</option>
            </select>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-border text-muted-foreground border-b">
                  <tr>
                    <th className="px-2 py-3 font-medium">Time</th>
                    <th className="px-2 py-3 font-medium">Operation</th>
                    <th className="px-2 py-3 font-medium">Model</th>
                    <th className="px-2 py-3 font-medium">Status</th>
                    <th className="px-2 py-3 text-right font-medium">Tokens</th>
                    <th className="px-2 py-3 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {(logs?.logs ?? []).map((log) => (
                    <tr key={log.id}>
                      <td className="text-muted-foreground px-2 py-3 whitespace-nowrap">
                        {formatDate(log.createdAt)}
                      </td>
                      <td className="px-2 py-3">{log.operation}</td>
                      <td className="text-muted-foreground px-2 py-3">
                        {log.model}
                      </td>
                      <td className="px-2 py-3 capitalize">{log.status}</td>
                      <td className="px-2 py-3 text-right">
                        {log.totalTokens.toLocaleString()}
                      </td>
                      <td className="px-2 py-3 text-right">
                        {formatCost(log.estimatedCostMicros)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {logs?.logs.length === 0 && (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  No matching calls.
                </p>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {logs?.total ?? 0} total calls
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || logsQuery.isFetching}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous
                </Button>
                <span>
                  {page} / {logs?.totalPages ?? 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    page >= (logs?.totalPages ?? 1) || logsQuery.isFetching
                  }
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DefaultLayout>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
