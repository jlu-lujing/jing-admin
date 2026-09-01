import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Info, AlertTriangle, Rocket } from "lucide-react";
import { get, put } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import type { Message, MessagePageData } from "../lib/types";
import { cn } from "../lib/utils";
import { Dropdown, IconButton } from "./ui/primitives";
import { toast } from "./ui/Toast";

export const MSG_KEYS = ["messages", "messages-unread"] as const;

export function useUnreadCount() {
  const token = useAuth((s) => s.accessToken);
  return useQuery({
    queryKey: ["messages-unread"],
    queryFn: () => get<{ unreadCount: number }>("/messages/unread"),
    enabled: !!token,
    refetchInterval: 20_000,
  });
}

const KIND_ICON = {
  info: { icon: Info, cls: "bg-lagoon-soft text-lagoon" },
  warning: { icon: AlertTriangle, cls: "bg-saffron-soft text-saffron" },
  update: { icon: Rocket, cls: "bg-ember-soft text-ember" },
} as const;

export function MessagesBell() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: unread } = useUnreadCount();
  const count = unread?.unreadCount ?? 0;

  const { data } = useQuery({
    queryKey: ["messages", 1, false],
    queryFn: () => get<MessagePageData>("/messages", { page: 1, pageSize: 5 }),
    staleTime: 10_000,
  });

  const readAll = useMutation({
    mutationFn: () => put("/messages/read-all"),
    onSuccess: () => {
      toast(t("已全部标为已读"));
      qc.invalidateQueries({ queryKey: ["messages"] });
    },
  });

  const markOne = useMutation({
    mutationFn: (id: number) => put(`/messages/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messages"] }),
  });

  return (
    <Dropdown
      panelClass="w-[340px]"
      trigger={() => (
        <IconButton className="relative" title={t("通知")}>
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <>
              <span className="anim-ping absolute -top-0.5 right-0 h-4 w-4 rounded-full bg-clay/50" />
              <span className="num absolute -top-0.5 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-clay px-1 text-[9px] font-bold text-white shadow-sm">
                {count > 99 ? "99+" : count}
              </span>
            </>
          )}
        </IconButton>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center justify-between border-b border-line-soft px-3 py-2.5">
            <p className="text-[13px] font-semibold text-ink">
              {t("通知")}
              {count > 0 && <span className="num ml-1.5 text-[11px] text-clay">{t("{n} 条未读", { n: count })}</span>}
            </p>
            {count > 0 && (
              <button
                onClick={() => readAll.mutate()}
                className="inline-flex items-center gap-1 text-[11.5px] font-medium text-ember-deep hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {t("全部已读")}
              </button>
            )}
          </div>
          <div className="max-h-[300px] overflow-y-auto py-1">
            {(data?.list ?? []).length === 0 && (
              <p className="px-3 py-6 text-center text-[12.5px] text-ink-mute">{t("暂无通知")}</p>
            )}
            {(data?.list ?? []).map((m: Message) => {
              const k = KIND_ICON[m.kind as keyof typeof KIND_ICON] ?? KIND_ICON.info;
              return (
                <button
                  key={m.id}
                  onClick={() => m.read === 0 && markOne.mutate(m.id)}
                  className="flex w-full items-start gap-3 rounded-[8px] px-3 py-2.5 text-left transition hover:bg-surface-2"
                >
                  <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px]", k.cls)}>
                    <k.icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={cn("truncate text-[12.5px] font-semibold", m.read ? "text-ink-mute" : "text-ink")}>
                        {m.title}
                      </span>
                      {!m.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-clay" />}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-relaxed text-ink-mute">{m.content}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => {
              close();
              navigate("/messages");
            }}
            className="block w-full rounded-[8px] px-3 py-2 text-center text-[12.5px] font-medium text-ember-deep transition hover:bg-ember-soft"
          >
            {t("查看全部消息")}
          </button>
        </>
      )}
    </Dropdown>
  );
}
