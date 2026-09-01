import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Check, X, Plus, BadgeCheck } from "lucide-react";
import { get, post, put } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { Badge, Button, Card, EmptyState, Field, Select, Skeleton } from "../components/ui/primitives";
import { Modal } from "../components/ui/Modal";
import { toast } from "../components/ui/Toast";
import { PageHeader } from "../components/layout";
import { cn, formatDate } from "../lib/utils";

interface ApplyRow {
  id: number;
  username: string;
  roleName: string;
  roleId: number;
  reason: string;
  status: string;
  createdAt: string;
  handledAt: string;
}
interface ApplyRole {
  id: number;
  name: string;
  code: string;
  description: string;
  owned: boolean;
}

const STATUS_TONE = { pending: "saffron", approved: "moss", rejected: "clay" } as const;

export default function Approvals() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const canHandle = useAuth((s) => s.has("system:approval:handle"));
  const [tab, setTab] = useState<"queue" | "mine">(canHandle ? "queue" : "mine");
  const [applying, setApplying] = useState(false);
  const [draft, setDraft] = useState({ roleId: "", reason: "" });

  const mine = useQuery({
    queryKey: ["applications", "mine"],
    queryFn: () => get<ApplyRow[]>("/applications"),
    enabled: !canHandle || tab === "mine",
  });
  const queue = useQuery({
    queryKey: ["applications", "queue"],
    queryFn: () => get<ApplyRow[]>("/applications/all"),
    enabled: canHandle && tab === "queue",
  });
  const roles = useQuery({
    queryKey: ["application-roles"],
    queryFn: () => get<ApplyRole[]>("/applications/roles"),
    enabled: applying,
  });

  const apply = useMutation({
    mutationFn: () => post("/applications", { roleId: Number(draft.roleId), reason: draft.reason }),
    onSuccess: () => {
      toast(t("申请已提交，等待审批"));
      setApplying(false);
      setDraft({ roleId: "", reason: "" });
      qc.invalidateQueries({ queryKey: ["applications"] });
    },
    onError: (e) => toast.error(t("提交失败"), e instanceof Error ? e.message : undefined),
  });

  const decide = useMutation({
    mutationFn: ({ id, verdict }: { id: number; verdict: "approve" | "reject" }) => put(`/applications/${id}/${verdict}`),
    onSuccess: (_, v) => {
      toast(v.verdict === "approve" ? t("已通过并自动授权") : t("已驳回"));
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => toast.error(t("操作失败"), e instanceof Error ? e.message : undefined),
  });

  const rows = (tab === "queue" ? queue.data : mine.data) ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workflow · Approvals"
        title={t("审批中心")}
        desc={t("权限自助申请流程：提交申请 → 管理员审批 → 通过即自动授予角色并推送通知。")}
        action={
          <Button variant="ember" icon={<Plus className="h-4 w-4" />} onClick={() => setApplying(true)}>
            {t("申请权限")}
          </Button>
        }
      />

      {canHandle && (
        <div className="anim-rise flex w-fit gap-1 rounded-full border border-line bg-surface p-1 shadow-soft">
          {(
            [
              ["queue", t("待我审批")],
              ["mine", t("我的申请")],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                "rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition",
                tab === k ? "bg-ember-soft text-ember-deep" : "text-ink-mute hover:text-ink",
              )}
            >
              {label}
              {k === "queue" && (queue.data ?? []).filter((r) => r.status === "pending").length > 0 && (
                <span className="num ml-1.5 rounded-full bg-clay px-1.5 text-[10px] text-white">
                  {(queue.data ?? []).filter((r) => r.status === "pending").length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <Card className="anim-rise overflow-hidden">
        {mine.isFetching || queue.isFetching ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={<Inbox className="h-5 w-5" />} title={t("暂无申请记录")} desc={t("点击右上角「申请权限」发起第一条申请")} />
          </div>
        ) : (
          <ul className="divide-y divide-line-soft">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-canvas-deep text-ink-soft">
                  <BadgeCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-ink">
                    {tab === "queue" && <span className="num mr-2 text-ink-mute">@{r.username}</span>}
                    {r.roleName}
                  </p>
                  <p className="mt-0.5 truncate text-[11.5px] text-ink-mute">
                    {r.reason || t("（未填写理由）")} · {formatDate(r.createdAt)}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"}>
                  {t(r.status === "pending" ? "待审批" : r.status === "approved" ? "已通过" : "已驳回")}
                </Badge>
                {canHandle && r.status === "pending" && tab === "queue" && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" icon={<Check className="h-3.5 w-3.5 text-moss" />} onClick={() => decide.mutate({ id: r.id, verdict: "approve" })}>
                      {t("通过")}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-clay" icon={<X className="h-3.5 w-3.5" />} onClick={() => decide.mutate({ id: r.id, verdict: "reject" })}>
                      {t("驳回")}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={applying}
        onClose={() => setApplying(false)}
        size="sm"
        title={t("申请权限")}
        desc={t("选择目标角色并说明用途，管理员审批后自动生效")}
        footer={
          <>
            <Button variant="outline" onClick={() => setApplying(false)}>{t("取消")}</Button>
            <Button variant="ember" loading={apply.isPending} disabled={!draft.roleId} onClick={() => apply.mutate()}>
              {t("提交申请")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t("目标角色")} required>
            <Select value={draft.roleId} onChange={(e) => setDraft((d) => ({ ...d, roleId: e.target.value }))}>
              <option value="">{t("请选择…")}</option>
              {(roles.data ?? [])
                .filter((r) => !r.owned)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.description}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label={t("申请理由")}>
            <textarea
              rows={3}
              value={draft.reason}
              onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))}
              placeholder={t("例如：接手安全合规工作，需要查看审计日志")}
              className="w-full rounded-[10px] border border-line bg-surface px-3.5 py-2.5 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-ember focus:outline-none focus:ring-4 focus:ring-ember/10"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
