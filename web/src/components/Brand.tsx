import { cn } from "../lib/utils";

/** 玻璃质感品牌方块：单色渐变 + 顶部高光斜切，呼应「琉璃」 */
export function BrandMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden", className)}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(6, size * 0.27),
        background:
          "linear-gradient(168deg, color-mix(in srgb, var(--c-ember) 74%, #ffffff) 0%, var(--c-ember) 48%, var(--c-ember-deep) 100%)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.45), inset 0 0 0 1px rgba(255,255,255,0.14), var(--c-shadow-ember)",
      }}
    >
      <span
        className="pointer-events-none absolute inset-x-[-30%] top-[-18%] h-[58%] rotate-[-14deg] bg-gradient-to-b from-white/45 to-transparent"
        aria-hidden="true"
      />
      <span
        className="relative font-display leading-none font-extrabold text-white"
        style={{ fontSize: size * 0.5, textShadow: "0 1px 2px rgba(0,0,0,0.18)" }}
      >
        J
      </span>
    </span>
  );
}

/** 文字标：编辑部衬线，统一色 + 品牌色句点（与看板 hero 的「.」同源） */
export function Wordmark({
  size = 16,
  onNight = false,
}: {
  size?: number;
  onNight?: boolean;
}) {
  return (
    <span className="leading-none">
      <span
        className="font-display font-extrabold tracking-tight"
        style={{ fontSize: size, color: onNight ? "#ffffff" : "var(--c-brand)" }}
      >
        JingAdmin
        <span style={{ color: "var(--c-brand-accent)" }}>.</span>
      </span>
    </span>
  );
}

/** 侧栏品牌区：方块 + 字标 + 字距拉开的 kicker */
export function BrandLockup({
  markSize = 34,
  textSize = 16,
  collapsed = false,
}: {
  markSize?: number;
  textSize?: number;
  collapsed?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
      <BrandMark size={markSize} />
      {!collapsed && (
        <div className="leading-none">
          <Wordmark size={textSize} />
          <p
            className="mt-1 font-sans text-[9px] font-semibold tracking-[0.3em] uppercase"
            style={{ color: "var(--c-nav-muted)" }}
          >
            Enterprise&nbsp;·&nbsp;Console
          </p>
        </div>
      )}
    </div>
  );
}
