import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Network, ChevronRight, ChevronDown, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { del, get, post, put } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import type { DeptNode } from "../lib/types";
import { cn } from "../lib/utils";
import { PageHeader } from "../components/layout";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Select,
  Skeleton,
} from "../components/ui/primitives";
import { ConfirmDialog, Modal } from "../components/ui/Modal";
import { toast } from "../components/ui/Toast";

interface FlatRow {
  node: DeptNode;
  depth: number;
}

function flatten(nodes: DeptNode[], depth = 0, out: FlatRow[] = []): FlatRow[] {
  for (const n of nodes) {
    out.push({ node: n, depth });
    flatten(n.children, depth + 1, out);
  }
  return out;
}

export default function Departments() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const canCreate = useAuth((s) => s.has("system:dept:create"));
  const canUpdate = useAuth((s) => s.has("system:dept:update"));
  const canDelete = useAuth((s) => s.has("system:dept:delete"));

  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<DeptNode | null>(null);
  const [creating, setCreating] = useState<{ parentId: number | null } | null>(null);
  const [deleting, setDeleting] = useState<DeptNode | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ["departments"],
    queryFn: () => get<DeptNode[]>("/departments"),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["departments"] });
    qc.invalidateQueries({ queryKey: ["users"] });
  };

  const removeMut = useMutation({
    mutationFn: (id: number) => del(`/departments/${id}`),
    onSuccess: () => {
      toast(t("部门已删除"));
      setDeleting(null);
      invalidate();
    },
    onError: (e) => toast.error(t("删除失败"), e instanceof Error ? e.message : undefined),
  });

  const moveMut = useMutation({
    mutationFn: async ({ node, delta }: { node: DeptNode; delta: number }) => {
      const flat = rows;
      const idx = flat.findIndex((r) => r.node.id === node.id);
      const sib = flat.filter((r) => r.node.parentId === node.parentId);
      const my = sib.findIndex((r) => r.node.id === node.id);
      const target = sib[my + delta];
      if (!target) return;
      await Promise.all([
        put(`/departments/${node.id}`, { name: node.name, parentId: node.parentId, sort: target.node.sort }),
        put(`/departments/${target.node.id}`, { name: target.node.name, parentId: target.node.parentId, sort: node.sort }),
      ]);
      void idx;
    },
    onSuccess: invalidate,
    onError: (e) => toast.error(t("排序失败"), e instanceof Error ? e.message : undefined),
  });

  const tree = useMemo(() => data ?? [], [data]);
  const rows = useMemo(() => flatten(tree).filter((r) => !collapsed.has(r.node.parentId ?? -1)), [tree, collapsed]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="System · Departments"
        title={t("部门管理")}
        desc={t("树形组织架构。重命名部门会级联更新成员归属；有成员或子部门的部门不可删除。")}
        action={
          canCreate && (
            <Button variant="ember" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating({ parentId: null })}>
              {t("新增部门")}
            </Button>
          )
        }
      />

      <Card className="anim-rise overflow-hidden" style={{ animationDelay: "0.06s" }}>
        {isFetching && !data ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={<Network className="h-5 w-5" />} title={t("还没有部门")} desc={t("创建第一个部门开始搭建组织架构。")} />
          </div>
        ) : (
          <ul className="divide-y divide-line-soft">
            {rows.map(({ node, depth }) => {
              const hasKids = node.children.length > 0;
              const isCollapsed = collapsed.has(node.id);
              return (
                <li
                  key={node.id}
                  className="group flex items-center gap-2 px-5 py-2.5 transition hover:bg-surface-2/70"
                  style={{ paddingLeft: 20 + depth * 26 }}
                >
                  <button
                    onClick={() =>
                      setCollapsed((s) => {
                        const n = new Set(s);
                        if (n.has(node.id)) n.delete(node.id);
                        else n.add(node.id);
                        return n;
                      })
                    }
                    className={cn("rounded p-0.5 text-ink-mute transition", !hasKids && "invisible")}
                  >
                    {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  <span className="text-[13.5px] font-medium text-ink">{t(node.name)}</span>
                  <Badge tone={node.userCount > 0 ? "lagoon" : "neutral"} className="num">
                    {node.userCount}
                  </Badge>
                  {depth === 0 && <span className="text-[11px] text-ink-faint">{t("一级")}</span>}
                  <div className="ml-auto flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                    {canUpdate && (
                      <>
                        <IconButton className="h-7 w-7" title={t("上移")} onClick={() => moveMut.mutate({ node, delta: -1 })}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton className="h-7 w-7" title={t("下移")} onClick={() => moveMut.mutate({ node, delta: 1 })}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton className="h-7 w-7" title={t("编辑")} onClick={() => setEditing(node)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </IconButton>
                      </>
                    )}
                    {canDelete && (
                      <IconButton className="h-7 w-7 text-clay hover:bg-clay-soft" title={t("删除")} onClick={() => setDeleting(node)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <DeptModal
        open={!!creating || !!editing}
        node={editing}
        defaultParentId={creating?.parentId ?? null}
        tree={tree}
        onClose={() => {
          setCreating(null);
          setEditing(null);
        }}
        onSaved={invalidate}
      />

      <ConfirmDialog
        open={!!deleting}
        title={t("删除部门")}
        desc={`${t("确定删除")} ${deleting?.name ? t(deleting.name) : ""} ${t("吗？有成员或子部门的部门无法删除。")}`}
        confirmText={t("删除")}
        loading={removeMut.isPending}
        onConfirm={() => deleting && removeMut.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function DeptModal({
  open,
  node,
  defaultParentId,
  tree,
  onClose,
  onSaved,
}: {
  open: boolean;
  node: DeptNode | null;
  defaultParentId: number | null;
  tree: DeptNode[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const isEdit = !!node;
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      setName(node?.name ?? "");
      setParentId(String(node?.parentId ?? defaultParentId ?? ""));
      setError(undefined);
    }
  }, [open, node, defaultParentId]);

  const parentOptions = useMemo(() => {
    const out: { id: number; label: string }[] = [];
    for (const r of flatten(tree)) {
      if (node && r.node.id === node.id) continue;
      out.push({ id: r.node.id, label: `${"　".repeat(r.depth)}${r.node.name}` });
    }
    return out;
  }, [tree, node]);

  const mut = useMutation({
    mutationFn: () => {
      const body = { name, parentId: parentId === "" ? null : Number(parentId), sort: node?.sort ?? 0 };
      return isEdit ? put(`/departments/${node!.id}`, body) : post("/departments", body);
    },
    onSuccess: () => {
      toast(isEdit ? t("部门已更新") : t("部门已创建"));
      onSaved();
      onClose();
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : undefined);
      toast.error(t("保存失败"), e instanceof Error ? e.message : undefined);
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={isEdit ? `${t("编辑部门")} · ${node?.name ? t(node.name) : ""}` : t("新增部门")}
      desc={isEdit ? t("重命名会级联更新成员归属") : t("在组织架构中创建一个节点")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t("取消")}</Button>
          <Button
            variant="ember"
            loading={mut.isPending}
            disabled={!name.trim()}
            onClick={() => {
              if (!name.trim()) return setError(t("请输入部门名称"));
              mut.mutate();
            }}
          >
            {isEdit ? t("保存变更") : t("创建部门")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("部门名称")} required error={error}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("平台研发部")} />
        </Field>
        <Field label={t("上级部门")} hint={t("留空表示一级部门")}>
          <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">{t("（无 · 一级部门）")}</option>
            {parentOptions.map((o) => (
              <option key={o.id} value={o.id}>{t(o.label)}</option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
