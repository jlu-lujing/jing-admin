import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Trash2, Copy, CheckCircle2 } from "lucide-react";
import { del, get, post } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, Skeleton } from "../components/ui/primitives";
import { ConfirmDialog, Modal } from "../components/ui/Modal";
import { toast } from "../components/ui/Toast";
import { PageHeader } from "../components/layout";
import { formatDate } from "../lib/utils";

interface KeyRow {
  id: number;
  name: string;
  prefix: string;
  owner: string;
  createdAt: string;
  lastUsed: string;
}

export default function Keys() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const canCreate = useAuth((s) => s.has("system:key:create"));
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<KeyRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["keys"],
    queryFn: () => get<KeyRow[]>("/keys"),
  });

  const create = useMutation({
    mutationFn: () => post<{ id: number; key: string }>("/keys", { name }),
    onSuccess: (d) => {
      setSecret(d.key);
      setCreating(false);
      setName("");
      qc.invalidateQueries({ queryKey: ["keys"] });
    },
    onError: (e) => toast.error(t("创建失败"), e instanceof Error ? e.message : undefined),
  });

  const revoke = useMutation({
    mutationFn: (id: number) => del(`/keys/${id}`),
    onSuccess: () => {
      toast(t("密钥已吊销"));
      setRevoking(null);
      qc.invalidateQueries({ queryKey: ["keys"] });
    },
  });

  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Developer · API Keys"
        title={t("API 密钥")}
        desc={t("供外部系统以 X-API-Key 请求头做只读集成（GET/HEAD），写操作一律 403。密钥仅创建时展示一次。")}
        action={
          canCreate && (
            <Button variant="ember" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              {t("创建密钥")}
            </Button>
          )
        }
      />

      <Card className="anim-rise overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={<KeyRound className="h-5 w-5" />} title={t("还没有 API 密钥")} desc={t("创建第一个密钥供外部系统只读接入")} />
          </div>
        ) : (
          <ul className="divide-y divide-line-soft">
            {rows.map((k) => (
              <li key={k.id} className="group flex items-center gap-3 px-5 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-canvas-deep text-ink-soft">
                  <KeyRound className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-ink">{k.name}</p>
                  <p className="num text-[11px] text-ink-faint">
                    {k.prefix}•••••• · {k.owner} · {formatDate(k.createdAt).slice(0, 10)} · {t("最近使用")}{" "}
                    {k.lastUsed ? formatDate(k.lastUsed) : t("从未")}
                  </p>
                </div>
                <Badge tone="moss">{t("只读")}</Badge>
                {canCreate && (
                  <IconButton className="text-clay opacity-0 transition group-hover:opacity-100" onClick={() => setRevoking(k)}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        size="sm"
        title={t("创建 API 密钥")}
        footer={
          <>
            <Button variant="outline" onClick={() => setCreating(false)}>{t("取消")}</Button>
            <Button variant="ember" loading={create.isPending} disabled={!name.trim()} onClick={() => create.mutate()}>
              {t("生成")}
            </Button>
          </>
        }
      >
        <Field label={t("用途名称")} required hint={t("例如：CI 报表拉取")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("未命名密钥")} />
        </Field>
      </Modal>

      <Modal open={!!secret} onClose={() => setSecret("")} size="md" title={t("密钥已生成")} desc={t("请立即复制保存，关闭后无法再次查看")}>
        <div className="flex items-center gap-2 rounded-[10px] border border-ember/30 bg-ember-soft/40 p-3">
          <code className="num min-w-0 flex-1 break-all text-[12.5px] text-ink">{secret}</code>
          <Button
            size="sm"
            variant="outline"
            icon={copied ? <CheckCircle2 className="h-3.5 w-3.5 text-moss" /> : <Copy className="h-3.5 w-3.5" />}
            onClick={() => {
              navigator.clipboard?.writeText(secret);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {t("复制")}
          </Button>
        </div>
        <p className="mt-3 text-[12px] text-ink-mute">{t("调用示例：curl -H \"X-API-Key: …\" /api/users")}</p>
      </Modal>

      <ConfirmDialog
        open={!!revoking}
        title={t("吊销密钥")}
        desc={`${t("吊销后使用")} ${revoking?.prefix ?? ""} ${t("的外部系统将立即无法访问。")}`}
        confirmText={t("吊销")}
        loading={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
        onCancel={() => setRevoking(null)}
      />
    </div>
  );
}
