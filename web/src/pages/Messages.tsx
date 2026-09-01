import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Info, AlertTriangle, Rocket, Inbox, Radio } from "lucide-react";
import { get, put } from "../lib/api";
import { useI18n, type I18n } from "../lib/i18n";
import type { Message, MessagePageData } from "../lib/types";
import { cn, formatDate } from "../lib/utils";
import { PageHeader } from "../components/layout";
import { Button, Card, Checkbox, EmptyState, Skeleton } from "../components/ui/primitives";
import { toast } from "../components/ui/Toast";

const KIND_META = {
  info: { icon: Info, cls: "bg-lagoon-soft text-lagoon" },
  warning: { icon: AlertTriangle, cls: "bg-saffron-soft text-saffron" },
  update: { icon: Rocket, cls: "bg-ember-soft text-ember" },
} as const;

function bucketOf(iso: string): "today" | "yesterday" | "earlier" {
  const t = new Date(iso).getTime();
  const now = new Date();
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (t >= day0) return "today";
  if (t >= day0 - 86400000) return "yesterday";
  return "earlier";
}

export default function Messages() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data, isFetching } = useQuery({
    queryKey: ["messages", page, unreadOnly],
    queryFn: () =>
      get<MessagePageData>("/messages", {
        page,
        pageSize: 15,
        unreadOnly: unreadOnly ? 1 : undefined,
      }),
    placeholderData: (p) => p,
  });

  const markOne = useMutation({
    mutationFn: (id: number) => put(`/messages/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messages"] }),
  });

  const readAll = useMutation({
    mutationFn: () => put("/messages/read-all"),
    onSuccess: () => {
      toast(t("已全部标为已读"));
      qc.invalidateQueries({ queryKey: ["messages"] });
    },
  });

  const list = data?.list ?? [];
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 15)));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Messages"
        title={t("通知中心")}
        desc={t("系统公告、安全提醒与团队动态，广播消息对全员可见。")}
        action={
          (data?.unreadCount ?? 0) > 0 && (
            <Button variant="outline" icon={<CheckCheck className="h-4 w-4" />} loading={readAll.isPending} onClick={() => readAll.mutate()}>
              {t("全部已读")}
            </Button>
          )
        }
      />

      <Card className="anim-rise overflow-hidden" style={{ animationDelay: "0.05s" }}>
        <div className="flex items-center justify-between border-b border-line-soft px-5 py-3">
          <Checkbox
            checked={unreadOnly}
            onChange={(v) => {
              setUnreadOnly(v);
              setPage(1);
            }}
            label={t("只看未读")}
          />
          <span className="num text-[12.5px] text-ink-mute">
            {t("共 {n} 条", { n: data?.total ?? 0 })}
          </span>
        </div>

        {isFetching && list.length === 0 ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={<Inbox className="h-5 w-5" />} title={t("暂无消息")} desc={t("系统事件发生后会自动推送通知。")} />
          </div>
        ) : (
          <div>
            {(
              [
                [t("今天"), "today"],
                [t("昨天"), "yesterday"],
                [t("更早"), "earlier"],
              ] as const
            ).map(([label, bucket]) => {
              const items = list.filter((m) => bucketOf(m.createdAt) === bucket);
              if (items.length === 0) return null;
              return (
                <div key={bucket}>
                  <p className="sticky top-0 z-10 border-y border-line-soft bg-surface-2 px-5 py-1.5 text-[10.5px] font-semibold tracking-[0.16em] text-ink-mute uppercase">
                    {label}
                  </p>
                  <ul className="divide-y divide-line-soft">
                    {items.map((m) => (
                      <MsgRow key={m.id} m={m} t={t} onRead={(id) => markOne.mutate(id)} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-center gap-1.5 border-t border-line-soft py-3">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {t("上一页")}
            </Button>
            <span className="num px-2 text-[12.5px] text-ink-mute">
              {page} / {pages}
            </span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              {t("下一页")}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function MsgRow({ m, t, onRead }: { m: Message; t: I18n["t"]; onRead: (id: number) => void }) {
  const k = KIND_META[m.kind as keyof typeof KIND_META] ?? KIND_META.info;
  return (
    <li>
      <button
        onClick={() => m.read === 0 && onRead(m.id)}
        className={cn(
          "flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-2/70",
          m.read === 0 && "bg-ember-soft/30",
        )}
      >
        <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]", k.cls)}>
          <k.icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className={cn("text-[13.5px] font-semibold", m.read ? "text-ink-soft" : "text-ink")}>{m.title}</span>
            {m.read === 0 && <span className="h-1.5 w-1.5 rounded-full bg-clay" />}
            {m.isBroadcast && (
              <span className="inline-flex items-center gap-1 rounded-full bg-canvas-deep px-2 py-0.5 text-[10.5px] text-ink-mute">
                <Radio className="h-2.5 w-2.5" />
                {t("全员广播")}
              </span>
            )}
          </span>
          <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-mute">{m.content}</span>
        </span>
        <span className="num shrink-0 text-[11.5px] text-ink-faint">{formatDate(m.createdAt).slice(5)}</span>
      </button>
    </li>
  );
}
