import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Trash,
  Pencil,
  Trash2,
  UserPlus,
  RotateCcw,
  UserCheck2,
  UserX2,
  X,
  Download,
  Upload,
  Columns3,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Rows3,
  History,
} from "lucide-react";
import { del, download, get, post, put } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import type { ImportResult, PageData, Role, User } from "../lib/types";
import { cn, formatDate, relativeTime } from "../lib/utils";
import { PageHeader } from "../components/layout";
import { TableShell, Th, Td, Tr } from "../components/table";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Dropdown,
  EmptyState,
  Field,
  IconButton,
  Input,
  MenuItem,
  Pagination,
  SearchInput,
  Select,
  Skeleton,
  StatusPill,
  Switch,
} from "../components/ui/primitives";
import { ConfirmDialog, Modal } from "../components/ui/Modal";
import { Drawer, DrawerField, DrawerSection } from "../components/ui/Drawer";
import { PasswordStrength } from "../components/ui/PasswordStrength";
import type { AuditLog } from "../lib/types";
import { toast } from "../components/ui/Toast";

const DEPTS = ["技术中台", "产品设计部", "增长运营部", "数据智能部", "安全合规部"];

interface UserForm {
  username: string;
  password: string;
  nickname: string;
  email: string;
  phone: string;
  dept: string;
  position: string;
  status: boolean;
  roles: number[];
}

const EMPTY_FORM: UserForm = {
  username: "",
  password: "",
  nickname: "",
  email: "",
  phone: "",
  dept: DEPTS[0],
  position: "",
  status: true,
  roles: [],
};

export default function Users() {
  const qc = useQueryClient();
  const { t } = useI18n();
  const canCreate = useAuth((s) => s.has("system:user:create"));
  const canUpdate = useAuth((s) => s.has("system:user:update"));
  const canDelete = useAuth((s) => s.has("system:user:delete"));
  const canViewRoles = useAuth((s) => s.has("system:role:list"));

  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, Number(sp.get("p") || 1));
  const dept = sp.get("dept") ?? "";
  const status = sp.get("st") ?? "";
  const debounced = sp.get("q") ?? "";
  const sortField = sp.get("sort");
  const sort = sortField
    ? { field: sortField, order: (sp.get("order") === "desc" ? "desc" : "asc") as "asc" | "desc" }
    : null;
  const [keyword, setKeyword] = useState(debounced);
  function patch(next: Record<string, string | null>) {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(next)) {
      if (!v) n.delete(k);
      else n.set(k, v);
    }
    setSp(n, { replace: true });
  }
  const [drawerUser, setDrawerUser] = useState<User | null>(null);
  const [dense, setDense] = useState(() => localStorage.getItem("jing-dense") === "1");
  const toggleDense = () =>
    setDense((d) => {
      localStorage.setItem("jing-dense", d ? "0" : "1");
      return !d;
    });
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("jing-users-cols") ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const toggleCol = (k: string) =>
    setHidden((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      localStorage.setItem("jing-users-cols", JSON.stringify([...n]));
      return n;
    });
  const col = (k: string) => !hidden.has(k);
  const sortBy = (field: string) => {
    if (!sort || sort.field !== field) patch({ sort: field, order: "asc", p: null });
    else if (sort.order === "asc") patch({ order: "desc" });
    else patch({ sort: null, order: null, p: null });
  };
  const [active, setActive] = useState(-1);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<null | "enable" | "disable" | "delete">(null);
  const [importOpen, setImportOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);

  useEffect(() => {
    if (keyword === debounced) return;
    const tt = setTimeout(() => patch({ q: keyword || null, p: null }), 350);
    return () => clearTimeout(tt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);
  useEffect(() => {
    setSelected(new Set());
    setActive(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, dept, status, sp.get("sort")]);

  const { data, isFetching } = useQuery({
    queryKey: ["users", sp.toString()],
    queryFn: () =>
      get<PageData<User>>("/users", {
        page,
        pageSize: 10,
        keyword: debounced || undefined,
        dept: dept || undefined,
        status: status === "" ? undefined : Number(status),
        sort: sort?.field,
        order: sort?.order,
      }),
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (active < 0) return;
    tableWrapRef.current?.querySelector(`tr:nth-of-type(${active + 1})`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const { data: roles } = useQuery({
    queryKey: ["roles-all"],
    queryFn: () => get<PageData<Role>>("/roles"),
    enabled: canViewRoles,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["users"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
  };

  const removeMut = useMutation({
    mutationFn: (id: number) => del(`/users/${id}`),
    onSuccess: () => {
      toast(t("用户已删除"));
      setDeleting(null);
      invalidate();
    },
    onError: (e) => toast.error(t("删除失败"), e instanceof Error ? e.message : undefined),
  });

  const bulkMut = useMutation({
    mutationFn: async (action: "enable" | "disable" | "delete") => {
      const ids = [...selected];
      await Promise.all(
        ids.map((id) =>
          action === "delete" ? del(`/users/${id}`) : put(`/users/${id}`, { status: action === "enable" ? 1 : 0 }),
        ),
      );
    },
    onSuccess: (_, action) => {
      toast(t(action === "delete" ? "批量删除完成" : action === "enable" ? "批量启用完成" : "批量停用完成"));
      setSelected(new Set());
      setBulkConfirm(null);
      invalidate();
    },
    onError: (e) => toast.error(t("操作失败"), e instanceof Error ? e.message : undefined),
  });

  const rows = data?.list ?? [];
  const allChecked = rows.length > 0 && rows.every((u) => selected.has(u.id));
  const toggleAll = () =>
    setSelected((s) => {
      if (allChecked) return new Set();
      const next = new Set(s);
      rows.forEach((u) => next.add(u.id));
      return next;
    });
  const toggleOne = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="System · Users"
        title={t("用户管理")}
        desc={t("管理系统账号、组织归属与角色分配。所有变更实时写入审计日志。")}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => download("/users/export", `users-${new Date().toISOString().slice(0, 10)}.csv`)}>
              {t("导出 CSV")}
            </Button>
            {canCreate && (
              <Button variant="outline" icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>
                {t("导入")}
              </Button>
            )}
            {canCreate && (
              <Button variant="ember" icon={<UserPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>
                {t("新增用户")}
              </Button>
            )}
            {canDelete && <Button variant="outline" icon={<Trash className="h-4 w-4" />} onClick={() => setTrashOpen(true)}>{t("回收站")}</Button>}
          </div>
        }
      />

      <Card className="anim-rise overflow-hidden" style={{ animationDelay: "0.06s" }}>
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-5 py-3.5">
          <div className="w-full sm:w-64">
            <SearchInput
              icon={<Search className="h-4 w-4" />}
              placeholder={t("搜索用户名 / 昵称 / 邮箱")}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <div className="w-36">
            <Select value={dept} onChange={(e) => patch({ dept: e.target.value || null, p: null })} aria-label={t("部门筛选")}>
              <option value="">{t("全部部门")}</option>
              {DEPTS.map((d) => (
                <option key={d} value={d}>
                  {t(d)}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-32">
            <Select value={status} onChange={(e) => patch({ st: e.target.value || null, p: null })} aria-label={t("状态筛选")}>
              <option value="">{t("全部状态")}</option>
              <option value="1">{t("启用")}</option>
              <option value="0">{t("停用")}</option>
            </Select>
          </div>
          {(debounced || dept || status) && (
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              onClick={() => {
                setKeyword("");
                patch({ q: null, dept: null, st: null, p: null });
              }}
            >
              {t("清除筛选")}
            </Button>
          )}
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={toggleDense}
              title={dense ? t("标准密度") : t("紧凑密度")}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-[10px] border transition",
                dense ? "border-ember/30 bg-ember-soft text-ember" : "border-line text-ink-mute hover:border-line-strong hover:text-ink",
              )}
            >
              <Rows3 className="h-4 w-4" />
            </button>
            <Dropdown
              panelClass="w-44"
              trigger={() => (
                <button className="flex h-10 items-center gap-1.5 rounded-[10px] border border-line px-3 text-[12.5px] font-medium text-ink-mute transition hover:border-line-strong hover:text-ink">
                  <Columns3 className="h-3.5 w-3.5" />
                  {t("列设置")}
                </button>
              )}
            >
              {() => (
                <div className="py-1">
                  {(
                    [
                      ["dept", t("部门 / 职位")],
                      ["roles", t("角色")],
                      ["status", t("状态")],
                      ["lastLogin", t("最近登录")],
                    ] as const
                  ).map(([k, label]) => (
                    <MenuItem key={k} onClick={() => toggleCol(k)}>
                      <span className="flex w-full items-center justify-between">
                        {label}
                        <span className="text-[11px] font-semibold text-ember-deep">{col(k) ? t("显示") : t("隐藏")}</span>
                      </span>
                    </MenuItem>
                  ))}
                </div>
              )}
            </Dropdown>
            <span className="text-[12.5px] text-ink-mute">
              {isFetching ? t("同步中…") : t("共 {n} 位用户", { n: data?.total ?? 0 })}
            </span>
          </div>
        </div>

        {/* bulk action bar */}
        {selected.size > 0 && (
          <div className="anim-fade flex flex-wrap items-center gap-2.5 border-b border-line-soft bg-ember-soft/60 px-5 py-2.5">
            <span className="num text-[12.5px] font-semibold text-ember-deep">
              {t("已选 {n} 项", { n: selected.size })}
            </span>
            {canUpdate && (
              <>
                <Button size="sm" variant="outline" icon={<UserCheck2 className="h-3.5 w-3.5" />} onClick={() => setBulkConfirm("enable")}>
                  {t("批量启用")}
                </Button>
                <Button size="sm" variant="outline" icon={<UserX2 className="h-3.5 w-3.5" />} onClick={() => setBulkConfirm("disable")}>
                  {t("批量停用")}
                </Button>
              </>
            )}
            {canDelete && (
              <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setBulkConfirm("delete")}>
                {t("批量删除")}
              </Button>
            )}
            <button
              onClick={() => setSelected(new Set())}
              className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-ink-mute hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
              {t("取消选择")}
            </button>
          </div>
        )}

        {/* table */}
        {rows.length === 0 && !isFetching ? (
          <div className="p-6">
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title={t("没有匹配的用户")}
              desc={t("调整筛选条件，或创建一个新的用户账号。")}
            />
          </div>
        ) : (
          <div
            ref={tableWrapRef}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(rows.length - 1, a + 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              if (e.key === "Enter" && active >= 0 && rows[active]) setDrawerUser(rows[active]);
              if (e.key === "Escape") setActive(-1);
            }}
            className={cn("outline-none", dense && "[&_td]:!py-1.5")}
          >
          <TableShell>
            <thead>
              <tr>
                {(canUpdate || canDelete) && (
                  <Th className="sticky left-0 z-[15] w-10">
                    <Checkbox checked={allChecked} onChange={toggleAll} />
                  </Th>
                )}
                <Th className="sticky left-[58px] z-[15]">
                  <SortHead label={t("用户")} active={sort} field="username" onSort={sortBy} />
                </Th>
                {col("dept") && (
                  <Th>
                    <SortHead label={t("部门 / 职位")} active={sort} field="dept" onSort={sortBy} />
                  </Th>
                )}
                {col("roles") && <Th>{t("角色")}</Th>}
                {col("status") && (
                  <Th>
                    <SortHead label={t("状态")} active={sort} field="status" onSort={sortBy} />
                  </Th>
                )}
                {col("lastLogin") && <Th>{t("最近登录")}</Th>}
                <Th className="text-right">{t("操作")}</Th>
              </tr>
            </thead>
            <tbody>
              {isFetching && rows.length === 0
                ? Array.from({ length: 5 }).map((_, i) => (
                    <Tr key={i}>
                      {(canUpdate || canDelete) && <Td><Skeleton className="h-5 w-5" /></Td>}
                      <Td><Skeleton className="h-9 w-48" /></Td>
                      {col("dept") && <Td><Skeleton className="h-6 w-32" /></Td>}
                      {col("roles") && <Td><Skeleton className="h-5 w-24" /></Td>}
                      {col("status") && <Td><Skeleton className="h-5 w-14" /></Td>}
                      {col("lastLogin") && <Td><Skeleton className="h-4 w-20" /></Td>}
                      <Td><Skeleton className="ml-auto h-8 w-8" /></Td>
                    </Tr>
                  ))
                : rows.map((u) => (
                    <Tr key={u.id} className={cn(selected.has(u.id) && "bg-ember-soft/40", active === rows.indexOf(u) && "bg-ember-soft/60 ring-1 ring-inset ring-ember/30")}>
                      {(canUpdate || canDelete) && (
                        <Td className="sticky left-0 z-[4] bg-inherit">
                          <Checkbox checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} />
                        </Td>
                      )}
                      <Td className="sticky left-[58px] z-[4] bg-inherit">
                        <button
                          onClick={() => setDrawerUser(u)}
                          className="group flex items-center gap-3 text-left"
                          title={t("查看详情")}
                        >
                          <Avatar name={u.nickname || u.username} size={dense ? 30 : 36} className="transition group-hover:ring-2 group-hover:ring-ember/25" />
                          <div className="min-w-0">
                            <p className="truncate text-[13.5px] font-semibold text-ink transition group-hover:text-ember">
                              {u.nickname || u.username}
                            </p>
                            <p className="num truncate text-[11.5px] text-ink-mute">
                              @{u.username} · {u.email || "—"}
                            </p>
                          </div>
                        </button>
                      </Td>
                      {col("dept") && (
                        <Td>
                          <p className="font-medium text-ink">{u.dept ? t(u.dept) : "—"}</p>
                          <p className="text-[11.5px] text-ink-mute">{u.position || "—"}</p>
                        </Td>
                      )}
                      {col("roles") && (
                        <Td>
                          <div className="flex flex-wrap gap-1">
                            {u.roles.length ? (
                              u.roles.map((r) => (
                                <Badge key={r} tone={r.includes("超级") ? "ember" : "neutral"}>
                                  {t(r)}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-ink-faint">{t("未分配")}</span>
                            )}
                          </div>
                        </Td>
                      )}
                      {col("status") && (
                        <Td>
                          <StatusPill status={u.status} />
                        </Td>
                      )}
                      {col("lastLogin") && (
                        <Td>
                          <span className="num text-[12px] text-ink-mute" title={u.lastLogin ?? ""}>
                            {relativeTime(u.lastLogin)}
                          </span>
                        </Td>
                      )}
                      <Td>
                        <div className="flex items-center justify-end gap-1">
                          {canUpdate && (
                            <IconButton
                              className="opacity-0 group-hover:opacity-100"
                              title={t("编辑")}
                              onClick={() => setEditing(u)}
                            >
                              <Pencil className="h-4 w-4" />
                            </IconButton>
                          )}
                          {canDelete && (
                            <IconButton
                              className="text-clay opacity-0 group-hover:opacity-100 hover:bg-clay-soft"
                              title={t("删除")}
                              onClick={() => setDeleting(u)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          )}
                          {!canUpdate && !canDelete && <span className="text-ink-faint">—</span>}
                        </div>
                      </Td>
                    </Tr>
                  ))}
            </tbody>
          </TableShell>
          </div>
        )}

        {data && data.total > 0 && (
          <div className="border-t border-line-soft">
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(p) => patch({ p: p === 1 ? null : String(p) })} />
          </div>
        )}
      </Card>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={invalidate} />

      {canDelete && <TrashModal open={trashOpen} onClose={() => setTrashOpen(false)} onChanged={invalidate} />}

      <UserDrawer
        user={drawerUser}
        onClose={() => setDrawerUser(null)}
        onEdit={(u) => {
          setDrawerUser(null);
          setEditing(u);
        }}
        canEdit={canUpdate}
      />

      <UserFormModal
        open={creating || !!editing}
        user={editing}
        roles={roles?.list ?? []}
        canViewRoles={canViewRoles}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={invalidate}
      />

      <ConfirmDialog
        open={!!deleting}
        title={t("删除用户")}
        desc={
          <>
            {t("确定删除用户")}{" "}
            <span className="font-semibold text-ink">{deleting?.nickname || deleting?.username}</span>{" "}
            {t("吗？该账号的登录会话将立即失效，此操作不可撤销。")}
          </>
        }
        confirmText={t("删除")}
        loading={removeMut.isPending}
        onConfirm={() => deleting && removeMut.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />

      <ConfirmDialog
        open={!!bulkConfirm}
        title={
          bulkConfirm === "delete" ? t("批量删除用户") : bulkConfirm === "enable" ? t("批量启用用户") : t("批量停用用户")
        }
        desc={t("将对已选的 {n} 个账号执行该操作，操作会逐条写入审计日志。", { n: selected.size })}
        confirmText={t("确认")}
        danger={bulkConfirm === "delete" || bulkConfirm === "disable"}
        loading={bulkMut.isPending}
        onConfirm={() => bulkConfirm && bulkMut.mutate(bulkConfirm)}
        onCancel={() => setBulkConfirm(null)}
      />
    </div>
  );
}

/* ---------------- Create / Edit modal ---------------- */
interface UserFormState {
  username: string;
  password: string;
  nickname: string;
  email: string;
  phone: string;
  dept: string;
  position: string;
  status: boolean;
  roles: number[];
}

function UserFormModal({
  open,
  user,
  roles,
  canViewRoles,
  onClose,
  onSaved,
}: {
  open: boolean;
  user: User | null;
  roles: Role[];
  canViewRoles: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const isEdit = !!user;
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof UserFormState, string>>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (user) {
      const matched = roles.filter((r) => user.roles.includes(r.name));
      setForm({
        username: user.username,
        password: "",
        nickname: user.nickname,
        email: user.email,
        phone: user.phone,
        dept: user.dept,
        position: user.position,
        status: user.status === 1,
        roles: matched.map((r) => r.id),
      });
    } else {
      setForm(EMPTY_FORM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);

  const set = <K extends keyof UserFormState>(k: K, v: UserFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const mut = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        const body: Record<string, unknown> = {
          nickname: form.nickname,
          email: form.email,
          phone: form.phone,
          dept: form.dept,
          position: form.position,
          status: form.status ? 1 : 0,
        };
        if (canViewRoles) body.roles = form.roles;
        if (form.password) body.password = form.password;
        return put(`/users/${user!.id}`, body);
      }
      return post("/users", {
        username: form.username,
        password: form.password,
        nickname: form.nickname,
        email: form.email,
        phone: form.phone,
        dept: form.dept,
        position: form.position,
        status: form.status ? 1 : 0,
        roles: canViewRoles ? form.roles : [],
      });
    },
    onSuccess: () => {
      toast(isEdit ? t("用户已更新") : t("用户已创建"));
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(t("保存失败"), e instanceof Error ? e.message : undefined),
  });

  function validate() {
    const errs: Partial<Record<keyof UserFormState, string>> = {};
    if (!isEdit) {
      if (!/^[a-z0-9_-]{3,32}$/.test(form.username)) errs.username = t("3-32 位小写字母 / 数字 / 下划线");
      if (form.password.length < 6) errs.password = t("密码至少 6 位");
    } else if (form.password && form.password.length < 6) {
      errs.password = t("留空保持不变，否则至少 6 位");
    }
    if (!form.nickname.trim()) errs.nickname = t("请输入昵称");
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errs.email = t("邮箱格式不正确");
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? `${t("编辑用户")} · ${user?.nickname || user?.username}` : t("新增用户")}
      desc={isEdit ? t("修改账号资料与角色分配") : t("创建一个新的企业账号")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("取消")}
          </Button>
          <Button variant="ember" loading={mut.isPending} onClick={() => validate() && mut.mutate()}>
            {isEdit ? t("保存变更") : t("创建用户")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("用户名")} required error={errors.username}>
          <Input
            value={form.username}
            disabled={isEdit}
            onChange={(e) => set("username", e.target.value)}
            placeholder="zhang_san"
            className={cn(isEdit && "opacity-60")}
          />
        </Field>
        <Field label={isEdit ? t("重置密码") : t("初始密码")} required={!isEdit} error={errors.password} hint={isEdit ? t("留空表示不修改密码") : t("至少 6 位")}>
          <div>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
            <PasswordStrength value={form.password} />
          </div>
        </Field>
        <Field label={t("昵称")} required error={errors.nickname}>
          <Input value={form.nickname} onChange={(e) => set("nickname", e.target.value)} placeholder={t("张三")} />
        </Field>
        <Field label={t("邮箱")} error={errors.email}>
          <Input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="name@company.com" />
        </Field>
        <Field label={t("手机号")}>
          <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="13800000000" />
        </Field>
        <Field label={t("部门")}>
          <Select value={form.dept} onChange={(e) => set("dept", e.target.value)}>
            {DEPTS.map((d) => (
              <option key={d}>{t(d)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("职位")}>
          <Input value={form.position} onChange={(e) => set("position", e.target.value)} placeholder={t("高级工程师")} />
        </Field>
        <div className="flex items-end pb-1">
          <div className="flex items-center gap-3 rounded-[10px] border border-line bg-surface-2 px-3.5 py-2.5">
            <Switch checked={form.status} onChange={(v) => set("status", v)} />
            <span className="text-[13px] font-medium text-ink-soft">
              {form.status ? t("账号启用") : t("账号停用")}
            </span>
          </div>
        </div>
      </div>

      {canViewRoles && (
        <div className="mt-5">
          <p className="mb-2 text-[12.5px] font-semibold text-ink-soft">{t("角色分配")}</p>
          <div>
            <p className="mb-1.5 text-[11px] tracking-wide text-ink-faint uppercase">{t("可分配角色")}</p>
            <div className="grid grid-cols-1 gap-2 rounded-[10px] border border-line bg-surface-2 p-3 sm:grid-cols-2">
              {roles.map((r) => (
                <Checkbox
                  key={r.id}
                  checked={form.roles.includes(r.id)}
                  onChange={(v) => set("roles", v ? [...form.roles, r.id] : form.roles.filter((x) => x !== r.id))}
                  label={
                    <span>
                      {t(r.name)}
                      <span className="num ml-1.5 text-[11px] text-ink-faint">{r.code}</span>
                    </span>
                  }
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------------- CSV import modal ---------------- */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQ = false;
      } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<{ username: string; nickname: string; email: string; phone: string; dept: string; position: string }[]>([]);
  const [parseError, setParseError] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      setFileName("");
      setRows([]);
      setParseError(undefined);
    }
  }, [open]);

  const mut = useMutation({
    mutationFn: () => post<ImportResult>("/users/import", { rows }),
    onSuccess: (res) => {
      toast(t("导入完成：成功 {n}，跳过 {s}", { n: res.imported, s: res.skipped }));
      onDone();
      onClose();
    },
    onError: (e) => toast.error(t("导入失败"), e instanceof Error ? e.message : undefined),
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result).replace(/^\ufeff/, "");
        const parsed = parseCsv(text);
        if (parsed.length < 2) {
          setParseError(t("CSV 至少需要表头与一行数据"));
          setRows([]);
          return;
        }
        const header = parsed[0].map((h) => h.trim().toLowerCase());
        const idx = (name: string) => header.indexOf(name);
        const required = idx("username");
        if (required < 0) {
          setParseError(t("缺少 username 列（表头需含 username,nickname,email,phone,dept,position）"));
          setRows([]);
          return;
        }
        const out = parsed.slice(1).map((r) => ({
          username: (r[required] ?? "").trim(),
          nickname: idx("nickname") >= 0 ? (r[idx("nickname")] ?? "").trim() : "",
          email: idx("email") >= 0 ? (r[idx("email")] ?? "").trim() : "",
          phone: idx("phone") >= 0 ? (r[idx("phone")] ?? "").trim() : "",
          dept: idx("dept") >= 0 ? (r[idx("dept")] ?? "").trim() : "",
          position: idx("position") >= 0 ? (r[idx("position")] ?? "").trim() : "",
        }));
        setParseError(undefined);
        setRows(out);
      } catch {
        setParseError(t("文件解析失败，请使用 UTF-8 编码的 CSV"));
      }
    };
    reader.readAsText(f);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("导入用户")}
      desc={t("上传 CSV 文件批量创建账号，新用户密码为 User@12345，建议通知本人登录后修改。")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("取消")}
          </Button>
          <Button variant="ember" loading={mut.isPending} disabled={rows.length === 0} onClick={() => mut.mutate()}>
            {t("导入 {n} 行", { n: rows.length })}
          </Button>
        </>
      }
    >
      <label className="dotgrid flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-line-strong px-6 py-10 text-center transition hover:border-ember hover:bg-ember-soft/20">
        <Upload className="h-6 w-6 text-ink-mute" />
        <span className="text-[13px] font-medium text-ink-soft">{fileName || t("点击选择 CSV 文件")}</span>
        <span className="num text-[11.5px] text-ink-faint">username, nickname, email, phone, dept, position</span>
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
      </label>
      {parseError && <p className="mt-3 text-[12.5px] text-clay">{parseError}</p>}
      {rows.length > 0 && (
        <p className="mt-3 text-[12.5px] text-ink-mute">
          {t("解析成功")} <span className="num font-semibold text-ink">{rows.length}</span> {t("行")} · {t("示例")}{" "}
          <span className="num">{rows[0].username}</span>
        </p>
      )}
    </Modal>
  );
}

function SortHead({
  label,
  field,
  active,
  onSort,
}: {
  label: string;
  field: string;
  active: { field: string; order: "asc" | "desc" } | null;
  onSort: (f: string) => void;
}) {
  const isActive = active?.field === field;
  return (
    <button
      onClick={() => onSort(field)}
      className={"inline-flex items-center gap-1 transition " + (isActive ? "text-ember" : "hover:text-ink-soft")}
    >
      {label}
      {isActive ? (
        active!.order === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      )}
    </button>
  );
}

function UserDrawer({
  user,
  onClose,
  onEdit,
  canEdit,
}: {
  user: User | null;
  onClose: () => void;
  onEdit: (u: User) => void;
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const { data: audit } = useQuery({
    queryKey: ["audit-user", user?.username],
    queryFn: () => get<PageData<AuditLog>>("/audit/logs", { page: 1, pageSize: 5, keyword: user!.username }),
    enabled: !!user,
  });

  return (
    <Drawer
      open={!!user}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2.5">
          <span className="inline-block"><Avatar name={user?.nickname || user?.username || "?"} size={30} /></span>
          {user?.nickname || user?.username}
        </span>
      }
      desc={user ? `@${user.username}` : ""}
      footer={
        canEdit &&
        user && (
          <>
            <Button variant="outline" size="sm" onClick={onClose}>{t("关闭")}</Button>
            <Button variant="ember" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => onEdit(user)}>
              {t("编辑用户")}
            </Button>
          </>
        )
      }
    >
      {user && (
        <>
          <DrawerSection label={t("账号")}>
            <div className="rounded-[12px] border border-line bg-surface-2 px-4 py-2">
              <DrawerField label={t("状态")} value={<StatusPill status={user.status} />} />
              <DrawerField label={t("部门")} value={user.dept ? t(user.dept) : "—"} />
              <DrawerField label={t("职位")} value={user.position} />
              <DrawerField label={t("邮箱")} value={user.email} />
              <DrawerField label={t("手机号")} value={user.phone} />
              <DrawerField label={t("最近登录")} value={relativeTime(user.lastLogin)} />
              <DrawerField label={t("创建于")} value={formatDate(user.createdAt)} />
            </div>
          </DrawerSection>

          <DrawerSection label={t("角色")}>
            <div className="flex flex-wrap gap-1.5">
              {user.roles.length ? (
                user.roles.map((r) => <Badge key={r} tone={r.includes("超级") ? "ember" : "neutral"}>{t(r)}</Badge>)
              ) : (
                <span className="text-[12px] text-ink-faint">{t("未分配")}</span>
              )}
            </div>
          </DrawerSection>

          <DrawerSection label={t("近期操作")}>
            <ul className="space-y-1">
              {(audit?.list ?? []).map((a) => (
                <li key={a.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                  <History className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-soft">{a.action} · {a.detail}</span>
                  <span className="num shrink-0 text-[10.5px] text-ink-faint">{relativeTime(a.createdAt)}</span>
                </li>
              ))}
              {(audit?.list ?? []).length === 0 && (
                <li className="text-[12px] text-ink-faint">{t("暂无操作记录")}</li>
              )}
            </ul>
          </DrawerSection>
        </>
      )}
    </Drawer>
  );
}

function TrashModal({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data, isFetching } = useQuery({
    queryKey: ["users-trash"],
    queryFn: () => get<User[]>("/users/trash"),
    enabled: open,
  });
  const restore = useMutation({
    mutationFn: (id: number) => put(`/users/${id}/restore`, {}),
    onSuccess: () => {
      toast(t("用户已恢复"));
      qc.invalidateQueries({ queryKey: ["users-trash"] });
      onChanged();
    },
  });
  const purge = useMutation({
    mutationFn: (id: number) => del(`/users/${id}/purge`),
    onSuccess: () => {
      toast(t("已彻底删除"));
      qc.invalidateQueries({ queryKey: ["users-trash"] });
      onChanged();
    },
  });

  return (
    <Modal open={open} onClose={onClose} size="md" title={t("回收站")} desc={t("软删除的用户可恢复，或彻底清除（含角色关联）")}>
      <ul className="space-y-2">
        {(data ?? []).length === 0 && (
          <li className="py-6 text-center text-[12.5px] text-ink-faint">{isFetching ? t("加载中…") : t("回收站是空的")}</li>
        )}
        {(data ?? []).map((u) => (
          <li key={u.id} className="flex items-center gap-3 rounded-[10px] border border-line bg-surface-2 px-3.5 py-2.5">
            <Avatar name={u.nickname || u.username} size={30} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-ink">{u.nickname || u.username}</p>
              <p className="num text-[11px] text-ink-faint">@{u.username} · {t("创建于")} {formatDate(u.createdAt).slice(0, 10)}</p>
            </div>
            <Button size="sm" variant="outline" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => restore.mutate(u.id)}>
              {t("恢复")}
            </Button>
            <Button size="sm" variant="ghost" className="text-clay" onClick={() => purge.mutate(u.id)}>
              {t("彻底删除")}
            </Button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
