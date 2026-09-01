import { Check, Moon, Monitor, Palette, Sun } from "lucide-react";
import { useTheme, type ThemeMode } from "../lib/theme";
import { baseChrome, THEMES, useAppTheme, type ThemeDef } from "../lib/themes";
import { useI18n } from "../lib/i18n";
import { cn } from "../lib/utils";
import { Dropdown } from "./ui/primitives";

const MODES: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
  { value: "system", label: "系统", icon: Monitor },
];

/** 用主题自己的色彩渲染一台微缩 console */
function ThemePreview({ def }: { def: ThemeDef }) {
  const c = def.core.light;
  const a = def.accent.light;
  const ch = { ...baseChrome(c, "light"), ...(def.chrome?.light ?? {}) };
  const hex = (v: string, fallback: string) => (v.startsWith("var(") ? fallback : v);
  const serif = (def.displayFont ?? "").includes("Serif");
  const mono = (def.displayFont ?? "").includes("Mono");

  return (
    <div
      className="flex h-[52px] w-full overflow-hidden rounded-[8px] border transition-transform duration-200 group-hover:scale-[1.03]"
      style={{ background: c.canvas, borderColor: c.lineStrong }}
    >
      <div className="flex w-[32%] flex-col gap-[5px] p-[7px]" style={{ background: hex(ch.sidebarBg, c.surface) }}>
        <span className="flex items-center gap-[3px]">
          <span className="h-[6px] w-[6px] rounded-[2px]" style={{ background: hex(ch.brandAccent, a.ember) }} />
          <span className="h-[4px] w-[14px] rounded-full" style={{ background: ch.navActiveText, opacity: 0.85 }} />
        </span>
        <span
          className="flex h-[7px] items-center gap-[3px] rounded-[3px] px-[3px]"
          style={{ background: hex(ch.navActiveBg, a.soft), boxShadow: ch.navActiveShadow !== "none" ? "0 0 5px rgba(167,139,250,.6)" : undefined }}
        >
          <span className="h-[3px] w-[10px] rounded-full" style={{ background: ch.navActiveText, opacity: 0.9 }} />
        </span>
        <span className="h-[5px] w-[18px] rounded-full" style={{ background: ch.navHover }} />
        <span className="h-[5px] w-[13px] rounded-full" style={{ background: ch.navHover }} />
      </div>
      <div className="flex flex-1 flex-col gap-[6px] p-[7px]">
        <span
          className="h-[6px] w-[46%] rounded-full"
          style={{ background: c.ink, opacity: 0.7, fontFamily: serif ? "serif" : mono ? "monospace" : undefined }}
        />
        <div className="flex flex-1 gap-[4px]">
          <div className="flex flex-[2] items-end gap-[3px] rounded-[4px] p-[5px]" style={{ background: c.surface, border: `1px solid ${c.line}` }}>
            {[0.45, 0.75, 0.35, 0.95, 0.6].map((h, i) => (
              <span key={i} className="flex-1 rounded-[1.5px]" style={{ height: `${h * 100}%`, background: `linear-gradient(180deg, ${a.glow}, ${a.ember})` }} />
            ))}
          </div>
          <div className="flex flex-1 flex-col justify-center gap-[4px] rounded-[4px] p-[5px]" style={{ background: c.surface, border: `1px solid ${c.line}` }}>
            <span className="h-[3px] w-3/4 rounded-full" style={{ background: a.ember }} />
            <span className="h-[3px] w-1/2 rounded-full" style={{ background: c.lineStrong }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ThemePicker() {
  const { t } = useI18n();
  const mode = useTheme((s) => s.mode);
  const setMode = useTheme((s) => s.setMode);
  const themeId = useAppTheme((s) => s.themeId);
  const setTheme = useAppTheme((s) => s.setTheme);

  return (
    <Dropdown
      panelClass="w-[360px] p-3"
      trigger={() => (
        <button
          className="flex h-9 w-9 items-center justify-center rounded-[10px] text-ink-soft transition hover:bg-canvas-deep hover:text-ink active:scale-95"
          title={t("主题")}
        >
          <Palette className="h-4 w-4" style={{ color: "var(--c-ember)" }} />
        </button>
      )}
    >
      {() => (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold tracking-[0.16em] text-ink-faint uppercase">{t("外观模式")}</p>
          <div className="mb-3.5 flex gap-1 rounded-[10px] border border-line bg-canvas p-1">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-[11.5px] font-semibold transition-all",
                  mode === m.value ? "bg-surface text-ember shadow-soft" : "text-ink-mute hover:text-ink",
                )}
              >
                <m.icon className="h-3.5 w-3.5" />
                {t(m.label)}
              </button>
            ))}
          </div>

          <p className="mb-2 text-[10px] font-semibold tracking-[0.16em] text-ink-faint uppercase">{t("主题")}</p>
          <div className="grid max-h-[320px] grid-cols-2 gap-2 overflow-y-auto pr-0.5">
            {THEMES.map((p) => {
              const on = p.id === themeId;
              return (
                <button
                  key={p.id}
                  onClick={() => setTheme(p.id)}
                  className={cn(
                    "group rounded-[12px] border p-2 text-left transition-all",
                    on
                      ? "border-ember/50 bg-ember-soft shadow-soft"
                      : "border-transparent hover:border-line hover:bg-canvas",
                  )}
                >
                  <ThemePreview def={p} />
                  <p className={cn("mt-2 flex items-center gap-1 text-[12px] font-semibold", on ? "text-ember-deep" : "text-ink")}>
                    {t(p.name)}
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </p>
                  <p className="text-[10.5px] text-ink-mute">{t(p.tagline)}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Dropdown>
  );
}
