import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings2, Pencil, Globe, Save } from "lucide-react";
import { get, put } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { Badge, Button, Card, EmptyState, Field, Input, Skeleton, Switch } from "../components/ui/primitives";
import { cn } from "../lib/utils";
import { Modal } from "../components/ui/Modal";
import { toast } from "../components/ui/Toast";
import { PageHeader } from "../components/layout";

interface ConfigRow {
  key: string;
  value: string;
  label: string;
  isPublic: number;
  updatedAt: string;
}

export default function Configs() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ConfigRow | null>(null);
  const [draft, setDraft] = useState({ value: "", isPublic: false });

  const { data, isLoading } = useQuery({
    queryKey: ["configs"],
    queryFn: () => get<ConfigRow[]>("/configs"),
  });

  const save = useMutation({
    mutationFn: () =>
      put("/configs", {
        items: [{ key: editing!.key, value: draft.value, isPublic: draft.isPublic ? 1 : 0 }],
      }),
    onSuccess: () => {
      toast(t("配置已保存"));
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["configs"] });
    },
    onError: (e) => toast.error(t("保存失败"), e instanceof Error ? e.message : undefined),
  });

  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="System · Config"
        title={t("配置中心")}
        desc={t("系统级键值配置，公开项无需登录即可读取（站点名称、公告横幅），修改实时生效并推送。")}
      />

      <LogLevelCard />

      <Card className="anim-rise overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={<Settings2 className="h-5 w-5" />} title={t("暂无配置项")} />
          </div>
        ) : (
          <ul className="divide-y divide-line-soft">
            {rows.map((c) => (
              <li key={c.key} className="group flex items-center gap-4 px-5 py-3.5 transition hover:bg-surface-2/60">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-canvas-deep text-ink-soft">
                  {c.isPublic ? <Globe className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="num text-[13px] font-semibold text-ink">{c.key}</span>
                    {!!c.isPublic && <Badge tone="moss">{t("公开")}</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-[12.5px] text-ink-mute">
                    {c.label} · <span className="num text-ink-faint">{c.value || "—"}</span>
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={() => {
                    setEditing(c);
                    setDraft({ value: c.value, isPublic: c.isPublic === 1 });
                  }}
                >
                  {t("编辑")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        size="md"
        title={`${t("编辑配置")} · ${editing?.key ?? ""}`}
        desc={editing?.label}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>{t("取消")}</Button>
            <Button variant="ember" loading={save.isPending} icon={<Save className="h-3.5 w-3.5" />} onClick={() => save.mutate()}>
              {t("保存")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t("配置值")}>
            <Input value={draft.value} onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))} />
          </Field>
          <div className="flex items-center gap-3 rounded-[10px] border border-line bg-surface-2 px-3.5 py-2.5">
            <Switch checked={draft.isPublic} onChange={(v) => setDraft((d) => ({ ...d, isPublic: v }))} />
            <span className="text-[13px] font-medium text-ink-soft">{t("公开可读（无需登录）")}</span>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function LogLevelCard() {
  const { t } = useI18n();
  const [level, setLevel] = useState("info");
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({ queryKey: ["log-level"], queryFn: () => get<{ level: string }>("/logs/level") });

  const set = async (lvl: string) => {
    setBusy(true);
    try {
      await put("/logs/level", { level: lvl });
      setLevel(lvl);
      toast(t("日志级别已生效"), { desc: lvl });
    } catch (e) {
      toast.error(t("设置失败"), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const cur = data?.level ?? level;
  return (
    <Card className="anim-rise flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <p className="text-[13.5px] font-semibold text-ink">{t("动态日志级别")}</p>
        <p className="text-[12px] text-ink-mute">{t("热切换（无需重启），并持久化到配置。当前：")}<span className="num font-semibold text-ink">{cur.split("=").pop()}</span></p>
      </div>
      <div className="flex gap-1 rounded-full border border-line bg-canvas p-1">
        {["error", "warn", "info", "debug", "trace"].map((lvl) => (
          <button
            key={lvl}
            disabled={busy}
            onClick={() => set(lvl)}
            className={cn(
              "num rounded-full px-3 py-1 text-[11.5px] font-semibold transition",
              cur === lvl ? "bg-ink text-canvas" : "text-ink-mute hover:text-ink",
            )}
          >
            {lvl}
          </button>
        ))}
      </div>
    </Card>
  );
}
