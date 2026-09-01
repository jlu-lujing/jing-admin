import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  ScrollText,
  UserCircle,
  Network,
  MonitorSmartphone,
  FileCode2,
  ChevronsLeft,
  ChevronsRight,
  Search,
  LogOut,
  Settings2,
  ChevronRight,
  Inbox,
  Menu,
  X,
  BookMarked,
  FolderOpen,
  Stamp,
  CalendarClock,
  KeySquare,
  Megaphone,
  Building2,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { get } from "../lib/api";
import { resolveTheme, useTheme, type ThemeMode } from "../lib/theme";
import { useI18n } from "../lib/i18n";
import { cn } from "../lib/utils";
import { Avatar, Badge, Dropdown, IconButton, MenuItem } from "./ui/primitives";
import { ConfirmDialog } from "./ui/Modal";
import { CommandPalette } from "./CommandPalette";
import { ThemePicker } from "./ThemePicker";
import { MessagesBell } from "./MessagesBell";
import { TabsBar } from "./TabsBar";
import { useRealtime } from "../lib/ws";
import { useTabs } from "../lib/tabs";
import { useAnnounce } from "../lib/announce";
import { isBusy, subscribeProgress } from "../lib/progress";

export interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  perm: string;
}
export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    title: "概览",
    items: [
      { to: "/", label: "数据看板", icon: LayoutDashboard, perm: "dashboard" },
      { to: "/messages", label: "通知中心", icon: Inbox, perm: "dashboard" },
      { to: "/docs", label: "API 文档", icon: FileCode2, perm: "dashboard" },
    ],
  },
  {
    title: "系统管理",
    items: [
      { to: "/users", label: "用户管理", icon: Users, perm: "system:user:list" },
      { to: "/roles", label: "角色权限", icon: ShieldCheck, perm: "system:role:list" },
      { to: "/departments", label: "部门管理", icon: Network, perm: "system:dept:list" },
      { to: "/audit", label: "审计日志", icon: ScrollText, perm: "system:audit:list" },
      { to: "/sessions", label: "会话管理", icon: MonitorSmartphone, perm: "system:session:list" },
      { to: "/approvals", label: "审批中心", icon: Stamp, perm: "" },
      { to: "/configs", label: "配置中心", icon: Settings2, perm: "system:config:list" },
      { to: "/dicts", label: "数据字典", icon: BookMarked, perm: "" },
      { to: "/files", label: "文件中心", icon: FolderOpen, perm: "" },
      { to: "/tasks", label: "定时任务", icon: CalendarClock, perm: "system:task:list" },
      { to: "/keys", label: "API 密钥", icon: KeySquare, perm: "system:key:list" },
      { to: "/tenants", label: "租户管理", icon: Building2, perm: "system:config:list" },
      { to: "/profile", label: "个人设置", icon: UserCircle, perm: "system:settings" },
    ],
  },
];

export function visibleNav() {
  const user = useAuth.getState().user;
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.perm === "" || user?.permissions.includes(i.perm)),
  })).filter((g) => g.items.length > 0);
}

export function AdminLayout() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const mode = useTheme((s) => s.mode);
  const [collapsed, setCollapsed] = useState(false);
  const isWide = useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(min-width: 1024px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true,
  );
  const collapsedEff = collapsed && isWide;
  useRealtime();
  const [mobileNav, setMobileNav] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { pathname } = useLocation();
  const { t, lang } = useI18n();
  const mainRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // "/" focuses the page search input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const editable = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === "/" && !editable && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>("main input[type=text], main input:not([type]), main input[type=search]");
        input?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setMobileNav(false);
  }, [pathname]);

  const onScroll = (e: React.UIEvent<HTMLElement>) => setScrolled(e.currentTarget.scrollTop > 4);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  const groups = visibleNav().map((g) => ({ ...g, items: g.items }));
  const current = NAV.flatMap((g) => g.items).find(
    (i) => i.to === pathname || (i.to !== "/" && pathname.startsWith(i.to)),
  );
  const currentGroup = NAV.find((g) => g.items.some((i) => i === current));

  const addTab = useTabs((s) => s.add);
  useEffect(() => {
    document.title = `${current ? t(current.label) : t("数据看板")} · JingAdmin`;
    if (current) addTab(current.to, current.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, lang]);

  const busy = useSyncExternalStore(subscribeProgress, isBusy);

  return (
    <div className="theme-fade flex h-full">
      {busy && (
        <div className="fixed inset-x-0 top-0 z-[70] h-[2.5px] overflow-hidden">
          <div className="progress-bar h-full w-full origin-left bg-gradient-to-r from-ember via-ember-glow to-ember" />
        </div>
      )}
      {/* ---------- Mobile overlay ---------- */}
      {mobileNav && (
        <div className="anim-fade fixed inset-0 z-40 bg-night/50 backdrop-blur-[2px] lg:hidden" onClick={() => setMobileNav(false)} />
      )}

      {/* ---------- Sidebar ---------- */}
      <aside
        className={cn(
          "theme-fade z-50 flex shrink-0 flex-col border-r bg-[var(--c-sidebar)] text-[var(--c-nav-text)] transition-all duration-300 print:hidden [border-color:var(--c-sidebar-line)] lg:static lg:translate-x-0",
          "fixed inset-y-0 left-0",
          collapsedEff ? "lg:w-[72px]" : "lg:w-[236px]",
          "w-[260px]",
          mobileNav ? "translate-x-0 shadow-pop" : "-translate-x-full",
        )}
      >
        <button
          onClick={() => setMobileNav(false)}
          className="absolute right-3 top-5 rounded-lg p-1.5 text-[var(--c-nav-text)] hover:bg-[var(--c-nav-hover)] lg:hidden"
          aria-label="close"
        >
          <X className="h-4 w-4" />
        </button>
        <div className={cn("flex h-16 items-center gap-3 px-5", collapsedEff && "lg:justify-center lg:px-0")}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-gradient-to-br from-ember-glow to-ember-deep shadow-ember">
            <span className="font-display text-[16px] leading-none font-extrabold text-white">J</span>
          </div>
          {!collapsedEff && (
            <div className="leading-none">
              <p className="font-display text-[16px] font-extrabold tracking-tight text-[var(--c-brand)]">
                Jing<span className="text-[var(--c-brand-accent)]">Admin</span>
              </p>
              <p className="mt-0.5 font-sans text-[9.5px] tracking-[0.26em] text-[var(--c-nav-muted)] uppercase">Enterprise Suite</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {groups.map((g) => (
            <div key={g.title}>
              {!collapsedEff && (
                <p className="mb-2 px-2 font-sans text-[10px] font-semibold tracking-[0.2em] text-[var(--c-nav-muted)] uppercase">
                  {t(g.title)}
                </p>
              )}
              <ul className="space-y-0.5">
                {g.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === "/"}
                      title={t(item.label)}
                      className={({ isActive }) =>
                        cn(
                           "group relative flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[13.5px] font-medium transition-all duration-200 hover:translate-x-0.5",
                          collapsedEff && "lg:justify-center lg:px-0",
                          isActive
                            ? "bg-[var(--c-nav-active-bg)] text-[var(--c-nav-active-text)] shadow-[var(--c-nav-active-shadow)]"
                            : "text-[var(--c-nav-text)] hover:bg-[var(--c-nav-hover)] hover:text-[var(--c-brand)]",
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span className="absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-[var(--c-ember-glow)] to-[var(--c-ember)] shadow-[0_0_10px_var(--c-ember-glow)]" />
                          )}
                          <item.icon
                            className={cn(
                              "h-[18px] w-[18px] shrink-0 transition-colors",
                              isActive ? "text-[var(--c-nav-active-icon)]" : "text-[var(--c-nav-muted)] group-hover:text-[var(--c-nav-text)]",
                            )}
                            strokeWidth={isActive ? 2.2 : 1.9}
                          />
                          {!collapsedEff && <span className="truncate">{t(item.label)}</span>}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="space-y-1 border-t p-3 [border-color:var(--c-sidebar-line)]">
          {!collapsedEff && user && (
            <button
              onClick={() => navigate("/profile")}
              className="group flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition hover:bg-[var(--c-nav-hover)]"
            >
              <Avatar name={user.nickname || user.username} size={30} src={user.avatar} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-[var(--c-brand)]">{user.nickname || user.username}</span>
                <span className="block truncate text-[10.5px] text-[var(--c-nav-muted)]">{user.roles[0] ?? user.username}</span>
              </span>
              <Settings2 className="h-3.5 w-3.5 text-[var(--c-nav-muted)] opacity-0 transition group-hover:opacity-100" />
            </button>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className={cn(
              "hidden w-full items-center gap-3 rounded-[8px] px-3 py-2 text-[12.5px] text-[var(--c-nav-muted)] transition hover:bg-[var(--c-nav-hover)] hover:text-[var(--c-brand)] lg:flex",
              collapsedEff && "lg:justify-center lg:px-0",
            )}
          >
            {collapsedEff ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsedEff && t(collapsedEff ? "展开侧栏" : "收起侧栏")}
          </button>
          <button
            onClick={() => setMobileNav(false)}
            className="flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-[12.5px] text-[var(--c-nav-muted)] transition hover:bg-[var(--c-nav-hover)] hover:text-[var(--c-brand)] lg:hidden"
          >
            <X className="h-4 w-4" />
            {t("关闭菜单")}
          </button>
        </div>
      </aside>

      {/* ---------- Main column ---------- */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Topbar
          current={current}
          currentGroup={currentGroup}
          onSearch={() => setPaletteOpen(true)}
          onMenu={() => setMobileNav(true)}
          scrolled={scrolled}
        />
        <TabsBar />
        <AnnouncementBanner />
        <main
          ref={mainRef}
          onScroll={onScroll}
          className="ambient relative flex-1 overflow-y-auto overscroll-behavior-contain scroll-smooth"
        >
          <div key={pathname} className="anim-fade relative mx-auto w-full max-w-[1240px] px-6 py-7 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* expose theme toggle to palette actions */}
      <ThemeBridge mode={mode} />
    </div>
  );
}

function ThemeBridge({ mode }: { mode: ThemeMode }) {
  useEffect(() => {
    const handler = () => useTheme.getState().toggle();
    window.addEventListener("jing:toggle-theme", handler);
    return () => window.removeEventListener("jing:toggle-theme", handler);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = resolveTheme(mode);
  }, [mode]);
  return null;
}

function Topbar({
  current,
  currentGroup,
  onSearch,
  onMenu,
  scrolled,
}: {
  current?: NavItem;
  currentGroup?: NavGroup;
  onSearch: () => void;
  onMenu: () => void;
  scrolled?: boolean;
}) {
  const user = useAuth((s) => s.user);
  const clear = useAuth((s) => s.clear);
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const [confirmOut, setConfirmOut] = useState(false);

  return (
    <header
      className={cn(
        "theme-fade sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/85 px-5 backdrop-blur-md transition-shadow lg:px-8",
        scrolled && "shadow-soft",
      )}
    >
      <IconButton className="lg:hidden" onClick={onMenu} title="Menu">
        <Menu className="h-4.5 w-4.5" />
      </IconButton>

      {/* breadcrumb */}
      <nav className="flex min-w-0 items-center gap-1.5 text-[13px]" aria-label="breadcrumb">
        <button
          onClick={() => navigate("/")}
          className="shrink-0 font-semibold text-ink-mute transition hover:text-ember"
        >
          Jing<span className="text-ember">Admin</span>
        </button>
        {currentGroup && currentGroup.items.length > 1 && (
          <>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
            <span className="shrink-0 text-ink-mute">{t(currentGroup.title)}</span>
          </>
        )}
        {current && (
          <>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
            <span className="truncate font-display font-semibold text-ink">{t(current.label)}</span>
          </>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        {/* search / command */}
        <button
          onClick={onSearch}
          className="hidden h-9 items-center gap-2 rounded-[8px] border border-line bg-canvas px-3 text-[12.5px] text-ink-faint transition hover:border-line-strong hover:text-ink-mute md:flex"
        >
          <Search className="h-3.5 w-3.5" />
          {t("搜索用户、角色、日志…")}
          <kbd className="num ml-4 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[10.5px]">⌘K</kbd>
        </button>
        <IconButton className="md:hidden" onClick={onSearch} title="搜索">
          <Search className="h-4 w-4" />
        </IconButton>

        <MessagesBell />

        {/* language */}
        <button
          onClick={() => setLang(lang === "zh" ? "en" : "zh")}
          className="flex h-9 items-center gap-1 rounded-[10px] px-2.5 text-[12px] font-semibold text-ink-mute transition hover:bg-surface-2 hover:text-ink"
          title={lang === "zh" ? "Switch to English" : "切换为中文"}
        >
          <span className={cn(lang === "zh" && "text-ember")}>中</span>
          <span className="text-ink-faint">/</span>
          <span className={cn(lang === "en" && "text-ember")}>EN</span>
        </button>

        {/* theme */}
        <ThemePicker />

        <PresenceChip />
        <div className="mx-1 h-6 w-px bg-line" />

        {user && (
          <Dropdown
            trigger={(open) => (
              <button
                className={cn(
                  "flex items-center gap-2.5 rounded-[8px] border px-2 py-1.5 transition",
                  open ? "border-line-strong bg-surface-2 shadow-soft" : "border-transparent hover:bg-surface-2 hover:shadow-soft",
                )}
              >
                <Avatar name={user.nickname || user.username} size={28} />
                <span className="hidden text-left sm:block">
                  <span className="block text-[12.5px] leading-tight font-semibold text-ink">
                    {user.nickname || user.username}
                  </span>
                  <span className="block text-[10.5px] leading-tight text-ink-mute">{user.roles[0] ?? user.username}</span>
                </span>
              </button>
            )}
          >
            {(close) => (
              <>
                <div className="border-b border-line-soft px-3 py-2.5">
                  <p className="text-[13px] font-semibold text-ink">{user.nickname}</p>
                  <p className="num mt-0.5 text-[11.5px] text-ink-mute">{user.email}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {user.roles.map((r) => (
                      <Badge key={r} tone="ember">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="pt-1">
                  <MenuItem
                    icon={<Settings2 />}
                    onClick={() => {
                      close();
                      navigate("/profile");
                    }}
                  >
                    {t("个人设置")}
                  </MenuItem>
                  <MenuItem
                    icon={<LogOut />}
                    danger
                    onClick={() => {
                      close();
                      setConfirmOut(true);
                    }}
                  >
                    {t("退出登录")}
                  </MenuItem>
                </div>
              </>
            )}
          </Dropdown>
        )}
      </div>

      <ConfirmDialog
        open={confirmOut}
        title={t("退出登录")}
        desc={t("确定要退出当前账号吗？需要重新登录才能继续操作。")}
        confirmText={t("退出登录")}
        onConfirm={() => {
          clear();
          navigate("/login", { replace: true });
        }}
        onCancel={() => setConfirmOut(false)}
      />
    </header>
  );
}

function AnnouncementBanner() {
  const { banner, dismissed, setBanner, dismiss } = useAnnounce();
  const { t } = useI18n();
  useEffect(() => {
    get<{ announcement?: string }>("/configs/public")
      .then((c) => c.announcement && setBanner(c.announcement))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!banner || dismissed === banner) return null;
  return (
    <div className="anim-fade flex items-center gap-2.5 border-b border-ember/25 bg-ember-soft/70 px-5 py-2 lg:px-8">
      <Megaphone className="h-3.5 w-3.5 shrink-0 text-ember" />
      <p className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{banner}</p>
      <button
        onClick={dismiss}
        className="rounded p-1 text-ink-mute transition hover:bg-ember/10 hover:text-ink"
        aria-label={t("关闭公告")}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function PresenceChip() {
  const { t } = useI18n();
  const token = useAuth((s) => s.accessToken);
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    if (!token) return;
    let stop = false;
    const tick = () =>
      get<{ online: number }>("/presence")
        .then((d) => !stop && setN(d.online))
        .catch(() => {});
    tick();
    const id = setInterval(tick, 15_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [token]);
  if (n === null) return null;
  return (
    <span className="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-mute lg:inline-flex">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute h-full w-full rounded-full bg-moss anim-ping" />
        <span className="h-1.5 w-1.5 rounded-full bg-moss" />
      </span>
      {t("{n} 人在线", { n })}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  desc,
  action,
}: {
  eyebrow?: string;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="anim-rise mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[10px] font-semibold tracking-[0.18em] text-ink-mute uppercase shadow-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-ember" />
            {eyebrow}
          </p>
        )}
        <h2 className="font-display text-[26px] leading-tight font-bold tracking-tight text-ink">
          {title}
        </h2>
        {desc && <p className="mt-1.5 max-w-2xl text-[13.5px] text-ink-mute">{desc}</p>}
      </div>
      {action}
    </div>
  );
}
