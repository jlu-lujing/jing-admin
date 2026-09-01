import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Trash2 } from "lucide-react";
import { del, get, post } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, Select, Skeleton } from "../components/ui/primitives";
import { ConfirmDialog, Modal } from "../components/ui/Modal";
import { toast } from "../components/ui/Toast";
import { PageHeader } from "../components/layout";
import { formatDate } from "../lib/utils";

interface Tenant {
  id: number;
  name: string;
  plan: string;
  users: number;
  createdAt: string;
}

const PLAN_TONE = { enterprise: "ember", pro: "lagoon", free: "neutral" } as const;

export default function Tenants() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const canEdit = useAuth((s) => s.has("system:config:update"));
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", plan: "free" });
  const [removing, setRemoving] = useState<Tenant | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["tenants"], queryFn: () => get<Tenant[]>("/tenants") });

  const create = useMutation({
    mutationFn: () => post("/tenants", draft),
    onSuccess: () => {
      toast(t("租户已创建"));
      setAdding(false);
      setDraft({ name: "", plan: "free" });
      qc.invalidateQueries({ queryKey: ["tenants"] });
    },
    onError: (e) => toast.error(t("创建失败"), e instanceof Error ? e.message : undefined),
  });

  const remove = useMutation({
    mutationFn: (id: number) => del(`/tenants/${id}`),
    onSuccess: () => {
      toast(t("租户已删除"));
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ["tenants"] });
    },
    onError: (e) => toast.error(t("删除失败"), e instanceof Error ? e.message : undefined),
  });

  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="System · Multi-tenancy"
        title={t("租户管理")}
        desc={t("行级租户隔离：用户数据、成员列表与统计按租户切分，跨租户不可见。")}
        action={
          canEdit && (
            <Button variant="ember" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
              {t("新建租户")}
            </Button>
          )
        }
      />

      <Card className="anim-rise overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={<Building2 className="h-5 w-5" />} title={t("暂无租户")} />
          </div>
        ) : (
          <ul className="divide-y divide-line-soft">
            {rows.map((x) => (
              <li key={x.id} className="group flex items-center gap-3 px-5 py-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-canvas-deep text-ink-soft">
                  <Building2 className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-ink">{x.name}</p>
                  <p className="num text-[11px] text-ink-faint">
                    {t("{n} 名成员", { n: x.users })} · {formatDate(x.createdAt).slice(0, 10)}
                  </p>
                </div>
                <Badge tone={PLAN_TONE[x.plan as keyof typeof PLAN_TONE] ?? "neutral"}>{x.plan}</Badge>
                {canEdit && x.id !== 1 && (
                  <IconButton className="text-clay opacity-0 transition group-hover:opacity-100" onClick={() => setRemoving(x)}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        size="sm"
        title={t("新建租户")}
        footer={
          <>
            <Button variant="outline" onClick={() => setAdding(false)}>{t("取消")}</Button>
            <Button variant="ember" loading={create.isPending} disabled={!draft.name.trim()} onClick={() => create.mutate()}>
              {t("创建")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t("租户名称")} required>
            <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder={t("青岚科技")} />
          </Field>
          <Field label={t("套餐")}>
            <Select value={draft.plan} onChange={(e) => setDraft((d) => ({ ...d, plan: e.target.value }))}>
              <option value="free">free</option>
              <option value="pro">pro</option>
              <option value="enterprise">enterprise</option>
            </Select>
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!removing}
        title={t("删除租户")}
        desc={`${t("确定删除租户")} ${removing?.name ?? ""} ${t("吗？租户下仍有成员时不可删除。")}`}
        confirmText={t("删除")}
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
