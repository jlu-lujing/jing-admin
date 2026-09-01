import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MonitorSmartphone, LogOut, CheckCircle2, Laptop } from "lucide-react";
import { del, get, put } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import type { SessionInfo } from "../lib/types";
import { cn, formatDate } from "../lib/utils";
import { PageHeader } from "../components/layout";
import { Badge, Button, Card, CardHeader, EmptyState, Skeleton, Switch } from "../components/ui/primitives";
import { toast } from "../components/ui/Toast";

function deviceOf(ua: string) {
  if (!ua) return { label: "API", icon: Laptop };
  const os = /Windows/i.test(ua) ? "Windows" : /Mac OS X/i.test(ua) ? "macOS" : /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Linux/i.test(ua) ? "Linux" : "Unknown";
  const browser = /Edg/i.test(ua) ? "Edge" : /Chrome/i.test(ua) ? "Chrome" : /Safari/i.test(ua) ? "Safari" : /Firefox/i.test(ua) ? "Firefox" : "Browser";
  return { label: `${browser} · ${os}`, icon: Laptop };
}

export default function Sessions() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const canSeeAll = useAuth((s) => s.has("system:session:list"));
  const canRevoke = useAuth((s) => s.has("system:session:revoke"));
  const [showAll, setShowAll] = useState(false);

  const { data, isFetching } = useQuery({
    queryKey: ["sessions", showAll],
    queryFn: () => get<SessionInfo[]>(showAll ? "/sessions/all" : "/sessions"),
  });

  const revoke = useMutation({
    mutationFn: (id: number) => del(`/sessions/${id}`),
    onSuccess: () => {
      toast(t("会话已吊销"));
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (e) => toast.error(t("操作失败"), e instanceof Error ? e.message : undefined),
  });

  const kickOthers = useMutation({
    mutationFn: () => put("/sessions/revoke-others"),
    onSuccess: () => {
      toast(t("其他设备已下线"));
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  const list = data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="System · Sessions"
        title={t("会话管理")}
        desc={t("每个登录生成独立会话（JWT jti），吊销后 access/refresh 立即失效，实现强制下线。")}
        action={
          <Button variant="outline" icon={<LogOut className="h-4 w-4" />} onClick={() => kickOthers.mutate()} loading={kickOthers.isPending}>
            {t("注销其他设备")}
          </Button>
        }
      />

      <Card className="anim-rise overflow-hidden" style={{ animationDelay: "0.05s" }}>
        {canSeeAll && (
          <div className="flex items-center justify-between border-b border-line-soft px-5 py-3">
            <div className="flex items-center gap-3">
              <Switch checked={showAll} onChange={setShowAll} />
              <span className="text-[13px] font-medium text-ink-soft">{t("查看全部用户会话")}</span>
            </div>
            {canRevoke && (
              <Badge tone="saffron">{t("强制下线已启用")}</Badge>
            )}
          </div>
        )}
        <CardHeader title={showAll ? t("全部在线会话") : t("我的登录设备")} desc={t("仅展示未过期且未吊销的会话")} />

        {isFetching && list.length === 0 ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={<MonitorSmartphone className="h-5 w-5" />} title={t("没有活动会话")} />
          </div>
        ) : (
          <ul className="divide-y divide-line-soft">
            {list.map((s) => {
              const dev = deviceOf(s.userAgent);
              return (
                <li key={s.id} className={cn("flex items-center gap-4 px-5 py-3.5", s.isCurrent && "bg-ember-soft/30")}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-canvas-deep text-ink-soft">
                    <dev.icon className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-ink">{dev.label}</span>
                      {s.isCurrent ? (
                        <Badge tone="moss" dot>{t("当前设备")}</Badge>
                      ) : (
                        !s.isMine && <Badge tone="neutral">{s.username}</Badge>
                      )}
                    </div>
                    <p className="num mt-0.5 truncate text-[11.5px] text-ink-mute">
                      IP {s.ip || "—"} · {t("登录于")} {formatDate(s.createdAt)} · {t("有效至")} {formatDate(s.expiresAt)}
                    </p>
                  </div>
                  {!s.isCurrent && (s.isMine ? true : canRevoke) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-clay hover:bg-clay-soft"
                      icon={<LogOut className="h-3.5 w-3.5" />}
                      loading={revoke.isPending && revoke.variables === s.id}
                      onClick={() => revoke.mutate(s.id)}
                    >
                      {t("下线")}
                    </Button>
                  )}
                  {s.isCurrent && <CheckCircle2 className="h-4 w-4 text-moss" />}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
