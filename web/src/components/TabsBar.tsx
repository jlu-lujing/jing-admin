import { useLocation, useNavigate } from "react-router-dom";
import { X, MoreHorizontal } from "lucide-react";
import { useTabs } from "../lib/tabs";
import { useI18n } from "../lib/i18n";
import { cn } from "../lib/utils";
import { Dropdown, MenuItem } from "./ui/primitives";

export function TabsBar() {
  const { tabs, remove, closeOthers } = useTabs();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useI18n();

  if (tabs.length === 0) return null;

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line bg-canvas px-4 print:hidden lg:px-6">
      <div className="flex flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.key === pathname;
          return (
            <button
              key={tab.key}
              onClick={() => navigate(tab.key)}
              className={cn(
                "group flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition",
                active
                  ? "border-ember/30 bg-ember-soft text-ember-deep"
                  : "border-line bg-surface text-ink-mute hover:border-line-strong hover:text-ink",
              )}
            >
              {active && <span className="h-1.5 w-1.5 rounded-full bg-ember" />}
              <span className="max-w-[140px] truncate">{t(tab.label)}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  const rest = remove(tab.key);
                  if (active) navigate(rest[rest.length - 1]?.key ?? "/");
                }}
                className={cn(
                  "-mr-1 rounded p-0.5 transition hover:bg-canvas-deep",
                  active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                )}
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          );
        })}
      </div>
      <Dropdown
        trigger={() => (
          <button className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-mute transition hover:bg-surface-2 hover:text-ink">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
      >
        {(close) => (
          <>
            <MenuItem
              onClick={() => {
                closeOthers(pathname);
                close();
              }}
            >
              {t("关闭其他标签")}
            </MenuItem>
            <MenuItem
              danger
              onClick={() => {
                useTabs.getState().tabs.filter((x) => x.key !== "/").forEach((x) => remove(x.key));
                close();
              }}
            >
              {t("关闭全部标签")}
            </MenuItem>
          </>
        )}
      </Dropdown>
    </div>
  );
}
