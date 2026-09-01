import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Timer, CheckCircle2, XCircle } from "lucide-react";
import { get, post } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { Button, Card, CardHeader, Skeleton } from "../components/ui/primitives";
import { toast } from "../components/ui/Toast";
import { PageHeader } from "../components/layout";
import { formatDate } from "../lib/utils";

interface TaskInfo {
  id: string;
  name: string;
  intervalSec: number;
}
interface TaskRun {
  taskId: string;
  ok: number;
  detail: string;
  durationMs: number;
  createdAt: string;
}

export default function Tasks() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => get<{ tasks: TaskInfo[]; runs: TaskRun[] }>("/tasks"),
    refetchInterval: 30_000,
  });

  const run = useMutation({
    mutationFn: (id: string) => post(`/tasks/${id}/run`),
    onSuccess: (r) => {
      const res = r as { ok: boolean; detail: string };
      if (res.ok) toast(t("任务执行成功"), { desc: res.detail });
      else toast.error(t("任务执行失败"), res.detail);
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e) => toast.error(t("执行失败"), e instanceof Error ? e.message : undefined),
  });

  const tasks = data?.tasks ?? [];
  const runs = data?.runs ?? [];

  if (isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-28" />
        <Skeleton className="h-72" />
      </div>
    );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="System · Scheduler"
        title={t("定时任务")}
        desc={t("内置调度器每 10 分钟巡检，任务到期自动执行并记录历史，也可手动立即触发。")}
      />

      <div className="anim-rise grid grid-cols-1 gap-4 sm:grid-cols-2">
        {tasks.map((task) => (
          <Card key={task.id} className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-ember-soft text-ember">
                  <Timer className="h-[18px] w-[18px]" />
                </span>
                <div>
                  <p className="font-display text-[14.5px] font-semibold text-ink">{t(task.name)}</p>
                  <p className="num mt-0.5 text-[11.5px] text-ink-mute">
                    {t("每")} {Math.round(task.intervalSec / 3600)}h
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                icon={<Play className="h-3.5 w-3.5" />}
                loading={run.isPending && run.variables === task.id}
                onClick={() => run.mutate(task.id)}
              >
                {t("立即执行")}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="anim-rise">
        <CardHeader title={t("执行历史")} desc={t("最近 50 次执行记录，30 秒自动刷新")} />
        <ul className="divide-y divide-line-soft">
          {runs.length === 0 && <li className="px-5 py-8 text-center text-[12.5px] text-ink-faint">{t("暂无执行记录，点击「立即执行」试试")}</li>}
          {runs.map((r, i) => (
            <li key={i} className="flex items-center gap-3 px-5 py-3">
              {r.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-moss" /> : <XCircle className="h-4 w-4 shrink-0 text-clay" />}
              <span className="num w-36 shrink-0 text-[12px] font-medium text-ink">{r.taskId}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-mute">{r.detail}</span>
              <span className="num shrink-0 text-[11px] text-ink-faint">{r.durationMs}ms</span>
              <span className="num w-28 shrink-0 text-right text-[11px] text-ink-faint">{formatDate(r.createdAt).slice(5)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
