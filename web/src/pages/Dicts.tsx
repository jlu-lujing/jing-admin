import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus, Trash2, Check } from "lucide-react";
import { get, post, put, del } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { Button, Card, EmptyState, Field, IconButton, Input, Skeleton, Switch } from "../components/ui/primitives";
import { Modal } from "../components/ui/Modal";
import { toast } from "../components/ui/Toast";
import { PageHeader } from "../components/layout";
import { cn } from "../lib/utils";

interface DictItem {
  id: number;
  value: string;
  label: string;
  sort: number;
  enabled: number;
}
interface DictType {
  code: string;
  name: string;
  items: DictItem[];
}

export default function Dicts() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const canEdit = useAuth((s) => s.has("system:dict:update"));
  const [active, setActive] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ value: "", label: "", sort: "1" });

  const { data, isLoading } = useQuery({
    queryKey: ["dict"],
    queryFn: () => get<DictType[]>("/dict"),
  });

  const types = data ?? [];
  const activeType = types.find((x) => x.code === (active ?? types[0]?.code));

  const add = useMutation({
    mutationFn: () =>
      post("/dict/items", { typeCode: activeType!.code, value: draft.value, label: draft.label, sort: Number(draft.sort) || 0 }),
    onSuccess: () => {
      toast(t("字典项已添加"));
      setAdding(false);
      setDraft({ value: "", label: "", sort: "1" });
      qc.invalidateQueries({ queryKey: ["dict"] });
    },
    onError: (e) => toast.error(t("添加失败"), e instanceof Error ? e.message : undefined),
  });

  const toggle = useMutation({
    mutationFn: (i: DictItem) =>
      put(`/dict/items/${i.id}`, { typeCode: activeType!.code, value: i.value, label: i.label, sort: i.sort, enabled: i.enabled ? 0 : 1 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dict"] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => del(`/dict/items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dict"] }),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="System · Dictionary"
        title={t("数据字典")}
        desc={t("集中管理业务枚举，表单下拉与表格渲染统一取字典，停用即时全局生效。")}
        action={
          canEdit && (
            <Button variant="ember" icon={<Plus className="h-4 w-4" />} disabled={!activeType} onClick={() => setAdding(true)}>
              {t("新增字典项")}
            </Button>
          )
        }
      />

      {isLoading ? (
        <Card className="p-5">
          <Skeleton className="h-64" />
        </Card>
      ) : types.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={<BookOpen className="h-5 w-5" />} title={t("暂无字典")} />
        </Card>
      ) : (
        <div className="anim-rise grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
          <Card className="h-fit p-2">
            {types.map((x) => (
              <button
                key={x.code}
                onClick={() => setActive(x.code)}
                className={cn(
                  "mb-0.5 flex w-full items-center justify-between rounded-[10px] px-3 py-2.5 text-left text-[13px] font-medium transition",
                  x.code === activeType?.code ? "bg-ember-soft text-ember-deep" : "text-ink-soft hover:bg-surface-2",
                )}
              >
                {x.name}
                <span className="num text-[11px] text-ink-faint">{x.items.length}</span>
              </button>
            ))}
          </Card>

          <Card className="overflow-hidden">
            <ul className="divide-y divide-line-soft">
              {(activeType?.items ?? []).map((i) => (
                <li key={i.id} className="group flex items-center gap-3 px-5 py-3">
                  <span className="num flex-1 text-[13px] font-semibold text-ink">{i.value}</span>
                  <span className="flex-1 text-[13px] text-ink-soft">{i.label}</span>
                  <span className="num w-14 text-right text-[11.5px] text-ink-faint">#{i.sort}</span>
                  <Switch checked={i.enabled === 1} onChange={() => toggle.mutate(i)} />
                  {canEdit && (
                    <IconButton className="text-clay opacity-0 transition group-hover:opacity-100" onClick={() => remove.mutate(i.id)}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  )}
                </li>
              ))}
              {(activeType?.items ?? []).length === 0 && (
                <li className="px-5 py-8 text-center text-[12.5px] text-ink-faint">{t("该类型下暂无字典项")}</li>
              )}
            </ul>
          </Card>
        </div>
      )}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        size="sm"
        title={`${t("新增字典项")} · ${activeType?.name ?? ""}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setAdding(false)}>{t("取消")}</Button>
            <Button variant="ember" loading={add.isPending} disabled={!draft.value.trim() || !draft.label.trim()} icon={<Check className="h-3.5 w-3.5" />} onClick={() => add.mutate()}>
              {t("添加")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t("值 (value)")} required>
            <Input value={draft.value} onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))} placeholder="P6" />
          </Field>
          <Field label={t("显示名 (label)")} required>
            <Input value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} placeholder={t("高级")} />
          </Field>
          <Field label={t("排序")}>
            <Input value={draft.sort} onChange={(e) => setDraft((d) => ({ ...d, sort: e.target.value }))} className="num" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
