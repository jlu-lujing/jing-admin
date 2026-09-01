import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Search,
  CornerDownLeft,
  Moon,
  Languages,
  LogOut,
  ArrowUp,
  ArrowDown,
  Palette,
  Network,
  ScrollText,
  Inbox,
} from "lucide-react";
import { get } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAppTheme } from "../lib/themes";
import { useI18n } from "../lib/i18n";
import type { PageData } from "../lib/types";
void (null as unknown as PageData<unknown> | null);
import { cn } from "../lib/utils";
import { visibleNav } from "./layout";
import { Avatar } from "./ui/primitives";

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  keywords?: string;
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const clear = useAuth((s) => s.clear);
  const { t, lang, toggleLang } = useI18n();
  const [query, setQuery] = useState("");

  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);


  const [search, setSearch] = useState<{
    users?: { id: number; label: string; sub: string }[];
    departments?: { id: number; label: string }[];
    auditLogs?: { id: number; label: string; sub: string }[];
    messages?: { id: number; label: string }[];
  }>({});
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setSearch({});
      return;
    }
    let live = true;
    const tt = setTimeout(() => {
      get("/search", { q })
        .then((d) => live && setSearch(d as typeof search))
        .catch(() => {});
    }, 250);
    return () => {
      live = false;
      clearTimeout(tt);
    };
  }, [query]);
  const data = search;

  const staticCmds = useMemo<Cmd[]>(() => {
    const cmds: Cmd[] = visibleNav().flatMap((g) =>
      g.items.map<Cmd>((i) => ({
        id: `nav-${i.to}`,
        label: t(i.label),
        hint: t(g.title),
        icon: <i.icon className="h-4 w-4" strokeWidth={2} />,
        keywords: `${i.label} ${i.to}`,
        run: () => navigate(i.to),
      })),
    );
    cmds.push({
      id: "theme",
      label: document.documentElement.classList.contains("dark") ? t("切换为浅色模式") : t("切换为深色模式"),
      icon: <Moon className="h-4 w-4" />,
      keywords: "theme dark light 深色 浅色 主题",
      run: () => window.dispatchEvent(new Event("jing:toggle-theme")),
    });
    cmds.push({
      id: "palette",
      label: t("切换主题"),
      icon: <Palette className="h-4 w-4" />,
      keywords: "theme palette 主题 换主题 换肤 skin",
      run: () => useAppTheme.getState().cycle(),
    });
    cmds.push({
      id: "lang",
      label: lang === "zh" ? "Switch to English" : "切换为中文",
      icon: <Languages className="h-4 w-4" />,
      keywords: "language i18n 语言 english 中文",
      run: toggleLang,
    });
    cmds.push({
      id: "logout",
      label: t("退出登录"),
      icon: <LogOut className="h-4 w-4" />,
      keywords: "logout signout 退出",
      run: () => {
        clear();
        navigate("/login", { replace: true });
      },
    });
    return cmds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, lang, navigate]);

  const filteredCmds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staticCmds.slice(0, 6);
    return staticCmds.filter(
      (c) => c.label.toLowerCase().includes(q) || c.keywords?.toLowerCase().includes(q),
    );
  }, [query, staticCmds]);

  const userCmds = useMemo<Cmd[]>(() => {
    const cmds: Cmd[] = [];
    (data.users ?? []).forEach((u) =>
      cmds.push({
        id: `user-${u.id}`,
        label: u.label,
        hint: u.sub,
        icon: <Avatar name={u.label} size={20} />,
        keywords: `${u.label} ${u.sub} 用户 user`,
        run: () => navigate(`/users?q=${encodeURIComponent(u.label.split(" (")[1]?.replace(")", "") ?? u.label)}`),
      }),
    );
    (data.departments ?? []).forEach((d) =>
      cmds.push({ id: `dept-${d.id}`, label: d.label, hint: t("部门管理"), icon: <Network className="h-4 w-4" />, keywords: `${d.label} 部门`, run: () => navigate("/departments") }),
    );
    (data.auditLogs ?? []).forEach((a) =>
      cmds.push({ id: `log-${a.id}`, label: a.label, hint: a.sub, icon: <ScrollText className="h-4 w-4" />, keywords: `${a.label} ${a.sub} 审计`, run: () => navigate("/audit") }),
    );
    (data.messages ?? []).forEach((m) =>
      cmds.push({ id: `msg-${m.id}`, label: m.label, hint: t("通知中心"), icon: <Inbox className="h-4 w-4" />, keywords: `${m.label} 消息`, run: () => navigate("/messages") }),
    );
    return cmds;
  }, [data, navigate, t]);

  const all = [...filteredCmds, ...userCmds];

  useEffect(() => setActive((a) => Math.min(a, Math.max(0, all.length - 1))), [all.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => (all.length ? (a + 1) % all.length : 0));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => (all.length ? (a - 1 + all.length) % all.length : 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const cmd = all[active];
        if (cmd) {
          cmd.run();
          onClose();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, all, active, onClose]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  let idx = -1;

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-start justify-center p-4 pt-[12vh]">
      <div className="anim-fade fixed inset-0 bg-night/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className="anim-scale relative w-full max-w-[560px] overflow-hidden rounded-[12px] border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-3 border-b border-line-soft px-4">
          <Search className="h-4 w-4 shrink-0 text-ink-mute" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("搜索用户、角色、日志…")}
            className="h-13 w-full bg-transparent py-4 text-[14px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <kbd className="num shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-ink-mute">ESC</kbd>
        </div>

        <div ref={listRef} className="max-h-[340px] overflow-y-auto p-1.5">
          {all.length === 0 && (
            <p className="px-3 py-8 text-center text-[13px] text-ink-mute">{t("没有匹配的结果")}</p>
          )}
          {filteredCmds.length > 0 && (
            <p className="px-3 pt-2 pb-1 text-[10.5px] font-semibold tracking-[0.16em] text-ink-faint uppercase">
              {t("命令与导航")}
            </p>
          )}
          {filteredCmds.map((c) => {
            idx += 1;
            const i = idx;
            return <CmdRow key={c.id} cmd={c} active={i === active} idx={i} onPick={() => { c.run(); onClose(); }} onHover={() => setActive(i)} />;
          })}
          {userCmds.length > 0 && (
            <p className="px-3 pt-3 pb-1 text-[10.5px] font-semibold tracking-[0.16em] text-ink-faint uppercase">
              {t("全局搜索")}
            </p>
          )}
          {userCmds.map((c) => {
            idx += 1;
            const i = idx;
            return <CmdRow key={c.id} cmd={c} active={i === active} idx={i} onPick={() => { c.run(); onClose(); }} onHover={() => setActive(i)} />;
          })}
        </div>

        <div className="flex items-center gap-4 border-t border-line-soft bg-surface-2 px-4 py-2.5 text-[11px] text-ink-mute">
          <span className="flex items-center gap-1">
            <ArrowUp className="h-3 w-3" />
            <ArrowDown className="h-3 w-3" /> {t("导航")}
          </span>
          <span className="flex items-center gap-1">
            <CornerDownLeft className="h-3 w-3" /> {t("打开")}
          </span>
          <span className="num ml-auto">{all.length}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CmdRow({
  cmd,
  active,
  idx,
  onPick,
  onHover,
}: {
  cmd: Cmd;
  active: boolean;
  idx: number;
  onPick: () => void;
  onHover: () => void;
}) {
  return (
    <button
      data-idx={idx}
      onClick={onPick}
      onMouseMove={onHover}
        className={cn(
          "flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-left transition-colors",
        active ? "bg-ember-soft text-ember-deep" : "text-ink-soft hover:bg-surface-2",
      )}
    >
      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center", active ? "text-ember" : "text-ink-faint")}>
        {cmd.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-ink">{cmd.label}</span>
        {cmd.hint && <span className="block truncate text-[11.5px] text-ink-mute">{cmd.hint}</span>}
      </span>
      {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-ember" />}
    </button>
  );
}

/* separate hook to keep react-query import local */
import { useQuery } from "@tanstack/react-query";
void [useQuery];
