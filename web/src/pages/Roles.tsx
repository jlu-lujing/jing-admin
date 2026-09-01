import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Plus, Search, Pencil, Trash2, Lock } from "lucide-react";
import { del, get, post, put } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import type { PageData, Permission, Role } from "../lib/types";
import { cn, formatDate } from "../lib/utils";
import { PageHeader } from "../components/layout";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  IconButton,
  Input,
  SearchInput,
  Select,
  Skeleton,
  StatusPill,
  Switch,
} from "../components/ui/primitives";
import { ConfirmDialog, Modal } from "../components/ui/Modal";
import { toast } from "../components/ui/Toast";

function permGroup(code: string) {
  if (code === "dashboard") return "概览";
  if (code.startsWith("system:user")) return "用户管理";
  if (code.startsWith("system:role")) return "角色管理";
  if (code.startsWith("system:audit")) return "审计日志";
  if (code.startsWith("system:session")) return "会话";
  if (code.startsWith("system:dept")) return "部门";
  if (code.startsWith("system:config") || code.startsWith("system:dict")) return "配置";
  return "其他";
}

const SCOPE_DESC: Record<string, string> = {
  all: "可见全部成员",
  dept: "仅可见本部门成员",
  self: "仅可见自己",
};

function safeRules(json?: string | null): { field: string; eq: string }[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map((x) => ({ field: String(x?.field ?? ""), eq: String(x?.eq ?? "") })) : [];
  } catch {
    return [];
  }
}

export default function Roles() {
  const { t } = useI18n();
  const canCreate = useAuth((s) => s.has("system:role:create"));
  const canUpdate = useAuth((s) => s.has("system:role:update"));
  const canDelete = useAuth((s) => s.has("system:role:delete"));
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Role | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["roles", keyword],
    queryFn: () => get<PageData<Role>>("/roles", { keyword: keyword || undefined }),
  });

  const removeMut = useMutation({
    mutationFn: (id: number) => del(`/roles/${id}`),
    onSuccess: () => {
      toast(t("角色已删除"));
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (e) => toast.error(t("删除失败"), e instanceof Error ? e.message : undefined),
  });
  const qc = useQueryClient();

  const { data: catalog } = useQuery({
    queryKey: ["perm-catalog"],
    queryFn: () => get<Permission[]>("/roles/permissions"),
    enabled: canCreate || canUpdate,
  });

  const roles = data?.list ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="System · RBAC"
        title={t("角色权限")}
        desc={t("以权限码为核心的角色编排，支持 all/dept/self 数据范围与等值过滤规则。")}
        action={
          canCreate && (
            <Button variant="ember" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              {t("新建角色")}
            </Button>
          )
        }
      />

      <div className="anim-rise w-full max-w-sm">
        <SearchInput
          icon={<Search className="h-4 w-4" />}
          placeholder={t("搜索角色名称 / 标识")}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[210px]" />
          ))}
        </div>
      ) : roles.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title={t("没有匹配的角色")} desc={t("尝试其他关键词，或创建新角色。")} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {roles.map((r, i) => {
            const locked = r.code === "super_admin";
            return (
              <Card key={r.id} hover className="anim-rise flex flex-col p-5" style={{ animationDelay: `${i * 0.05}s` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-11 w-11 items-center justify-center rounded-[12px]",
                        locked ? "bg-ember-soft text-ember" : "bg-canvas-deep text-ink-soft",
                      )}
                    >
                      {locked ? <Lock className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-[15.5px] font-semibold text-ink">{t(r.name)}</h3>
                        {locked && <Badge tone="ember">{t("系统内置")}</Badge>}
                      </div>
                      <p className="num mt-0.5 text-[11.5px] text-ink-mute">{r.code}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusPill status={r.status} />
                    {!locked && (
                      <>
                        {canUpdate && (
                          <IconButton title={t("编辑")} onClick={() => setEditing(r)}>
                            <Pencil className="h-4 w-4" />
                          </IconButton>
                        )}
                        {canDelete && (
                          <IconButton className="text-clay hover:bg-clay-soft" title={t("删除")} onClick={() => setDeleting(r)}>
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <p className="mt-3 min-h-[36px] text-[12.5px] leading-relaxed text-ink-mute">{r.description ? t(r.description) : t("暂无描述")}</p>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone={r.dataScope === "dept" ? "lagoon" : r.dataScope === "self" ? "saffron" : "neutral"}>
                    {r.dataScope || "all"}
                  </Badge>
                  {r.permissions.length === 0 ? (
                    <span className="text-[12px] text-ink-faint">{t("未分配权限")}</span>
                  ) : r.permissions.length >= 10 ? (
                    <Badge tone="ember" dot>
                      {t("全部 {n} 项权限", { n: r.permissions.length })}
                    </Badge>
                  ) : (
                    r.permissions.slice(0, 5).map((p) => (
                      <Badge key={p} tone="neutral" className="num">
                        {p}
                      </Badge>
                    ))
                  )}
                  {r.permissions.length > 5 && r.permissions.length < 10 && (
                    <span className="num text-[11.5px] text-ink-faint">+{r.permissions.length - 5}</span>
                  )}
                  {safeRules(r.rulesJson).length > 0 && (
                    <Badge tone="plum">{t("规则 ×{n}", { n: safeRules(r.rulesJson).length })}</Badge>
                  )}
                </div>

                <div className="mt-auto flex items-center justify-between border-t border-line-soft pt-3.5 text-[11.5px] text-ink-mute">
                  <span>
                    <span className="num font-semibold text-ink">{r.userCount}</span> {t("名成员")}
                  </span>
                  <span className="num">{t("创建于")} {formatDate(r.createdAt).slice(0, 10)}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <RoleFormModal
        open={creating || !!editing}
        role={editing}
        catalog={catalog ?? []}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => qc.invalidateQueries({ queryKey: ["roles"] })}
      />

      <ConfirmDialog
        open={!!deleting}
        title={t("删除角色")}
        desc={
          <>
            {t("确定删除角色")} <span className="font-semibold text-ink">{deleting?.name ? t(deleting.name) : ""}</span>{" "}
            {t("吗？使用该角色的用户将失去对应权限。")}
          </>
        }
        confirmText={t("删除")}
        loading={removeMut.isPending}
        onConfirm={() => deleting && removeMut.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

interface RoleForm {
  name: string;
  code: string;
  description: string;
  status: boolean;
  permissions: string[];
  dataScope: "all" | "dept" | "self";
  rules: { field: string; eq: string }[];
}

function RoleFormModal({
  open,
  role,
  catalog,
  onClose,
  onSaved,
}: {
  open: boolean;
  role: Role | null;
  catalog: Permission[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const isEdit = !!role;
  const [form, setForm] = useState<RoleForm>({
    name: "",
    code: "",
    description: "",
    status: true,
    permissions: [],
    dataScope: "all",
    rules: [],
  });
  const [errors, setErrors] = useState<Partial<Record<keyof RoleForm, string>>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      role
        ? {
            name: role.name,
            code: role.code,
            description: role.description,
            status: role.status === 1,
            permissions: [...role.permissions],
            dataScope: ((role.dataScope as RoleForm["dataScope"]) || "all") ?? "all",
            rules: safeRules(role.rulesJson),
          }
        : { name: "", code: "", description: "", status: true, permissions: [], dataScope: "all", rules: [] },
    );
  }, [open, role]);

  const groups = useMemo(() => {
    const map = new Map<string, Permission[]>();
    catalog.forEach((p) => {
      const g = permGroup(p.code);
      map.set(g, [...(map.get(g) ?? []), p]);
    });
    return [...map.entries()];
  }, [catalog]);

  const mut = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        code: form.code,
        description: form.description,
        status: form.status ? 1 : 0,
        permissions: form.permissions,
        dataScope: form.dataScope,
        rulesJson: JSON.stringify(form.rules.filter((r) => r.field)),
      };
      return isEdit ? put(`/roles/${role!.id}`, body) : post("/roles", body);
    },
    onSuccess: () => {
      toast(isEdit ? t("角色已更新") : t("角色已创建"));
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(t("保存失败"), e instanceof Error ? e.message : undefined),
  });

  function validate() {
    const errs: Partial<Record<keyof RoleForm, string>> = {};
    if (!form.name.trim()) errs.name = t("请输入角色名称");
    if (!/^[a-z0-9_]{2,32}$/.test(form.code)) errs.code = t("2-32 位小写字母 / 数字 / 下划线");
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? `${t("编辑角色")} · ${role?.name ? t(role.name) : ""}` : t("新建角色")}
      desc={t("配置角色基本信息、权限勾选与数据范围")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("取消")}
          </Button>
          <Button variant="ember" loading={mut.isPending} onClick={() => validate() && mut.mutate()}>
            {isEdit ? t("保存变更") : t("创建角色")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("角色名称")} required error={errors.name}>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t("运营专员")} />
        </Field>
        <Field label={t("角色标识")} required error={errors.code} hint={t("用于程序判断，创建后建议保持稳定")}>
          <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="operator" className="num" />
        </Field>
        <Field label={t("描述")} className="sm:col-span-2">
          <Input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder={t("该角色的职责说明")}
          />
        </Field>

        <div className="flex items-center gap-3 rounded-[10px] border border-line bg-surface-2 px-3.5 py-2.5 sm:col-span-2">
          <Switch checked={form.status} onChange={(v) => setForm((f) => ({ ...f, status: v }))} />
          <span className="text-[13px] font-medium text-ink-soft">{form.status ? t("角色启用中") : t("角色已停用")}</span>
        </div>

        <Field label={t("数据范围 (ABAC)")} className="sm:col-span-2">
          <div className="flex gap-1 rounded-[10px] border border-line bg-canvas p-1">
            {(["all", "dept", "self"] as const).map((sc) => (
              <button
                key={sc}
                type="button"
                onClick={() => setForm((f) => ({ ...f, dataScope: sc }))}
                className={cn(
                  "flex-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition",
                  form.dataScope === sc ? "bg-surface text-ember shadow-soft" : "text-ink-mute hover:text-ink",
                )}
              >
                {sc}
                <span className="block text-[10.5px] font-normal text-ink-faint">{t(SCOPE_DESC[sc])}</span>
              </button>
            ))}
          </div>
        </Field>

        <div className="sm:col-span-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[12.5px] font-semibold text-ink-soft">{t("附加过滤规则")}</span>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, rules: [...f.rules, { field: "status", eq: "1" }] }))}
              className="text-[11.5px] font-semibold text-ember-deep hover:underline"
            >
              + {t("加规则")}
            </button>
          </div>
          <p className="mb-2 text-[11px] text-ink-faint">{t("成员列表将叠加以下等值过滤；值支持 {self.dept} 变量")}</p>
          {form.rules.map((r, i) => (
            <div key={i} className="mb-1.5 flex items-center gap-2">
              <Select
                className="h-9 w-32"
                value={r.field}
                onChange={(e) => setForm((f) => ({ ...f, rules: f.rules.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)) }))}
              >
                <option value="status">{t("状态")}</option>
                <option value="dept">{t("部门")}</option>
                <option value="position">{t("职位")}</option>
              </Select>
              <span className="text-[12px] text-ink-faint">=</span>
              <Input
                className="h-9 flex-1"
                value={r.eq}
                placeholder="1 / {self.dept}"
                onChange={(e) => setForm((f) => ({ ...f, rules: f.rules.map((x, j) => (j === i ? { ...x, eq: e.target.value } : x)) }))}
              />
              <IconButton type="button" className="text-clay" onClick={() => setForm((f) => ({ ...f, rules: f.rules.filter((_, j) => j !== i) }))}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <p className="text-[12.5px] font-semibold text-ink-soft">{t("权限勾选")}</p>
        {groups.map(([group, list]) => {
          const allChecked = list.every((p) => form.permissions.includes(p.code));
          return (
            <div key={group} className="rounded-[10px] border border-line bg-surface-2 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-mute uppercase">{t(group)}</p>
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      permissions: allChecked
                        ? f.permissions.filter((c) => !list.some((p) => p.code === c))
                        : [...new Set([...f.permissions, ...list.map((p) => p.code)])],
                    }))
                  }
                  className="text-[11.5px] font-medium text-ember-deep hover:underline"
                >
                  {allChecked ? t("取消全选") : t("全选")}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {list.map((p) => (
                  <Checkbox
                    key={p.code}
                    checked={form.permissions.includes(p.code)}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        permissions: v ? [...f.permissions, p.code] : f.permissions.filter((x) => x !== p.code),
                      }))
                    }
                    label={
                      <span className="block">
                        <span className="block text-[12.5px] font-medium text-ink">{t(p.name)}</span>
                        <span className="num block text-[10.5px] text-ink-faint">{p.code}</span>
                      </span>
                    }
                    className="rounded-[8px] border border-transparent px-2 py-1.5 transition hover:border-line hover:bg-surface"
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
