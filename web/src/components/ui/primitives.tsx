import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { cn, avatarTone, initials } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";

/* ---------------- Button ---------------- */
type Variant = "primary" | "ember" | "outline" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-ink text-canvas hover:bg-ink-soft hover:shadow-soft active:scale-[0.98] disabled:bg-ink/40",
  ember:
    "bg-ember text-white hover:bg-ember-deep hover:shadow-ember active:scale-[0.98] disabled:bg-ember/40",
  outline:
    "border border-line-strong bg-surface text-ink hover:border-ink-mute hover:bg-surface-2 active:scale-[0.98]",
  ghost: "text-ink-soft hover:bg-canvas-deep hover:text-ink active:scale-[0.98]",
  danger: "bg-clay text-white hover:brightness-95 active:scale-[0.98]",
  soft: "bg-ember-soft text-ember-deep hover:bg-ember/20 hover:shadow-soft active:scale-[0.98]",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[12.5px] gap-1.5 rounded-[var(--radius-btn)]",
  md: "h-9.5 px-4 text-[13.5px] gap-2 rounded-[var(--radius-btn)]",
  lg: "h-11 px-5 text-[14.5px] gap-2 rounded-[var(--radius-btn)]",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-70",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className={cn("anim-spin", size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")} />
      ) : (
        icon && <span className={cn(size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")}>{icon}</span>
      )}
      {children}
    </button>
  );
});

export function IconButton({
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-ink-soft transition hover:bg-canvas-deep hover:text-ink active:scale-95",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------------- Badge / Pill ---------------- */
type Tone = "neutral" | "ember" | "moss" | "saffron" | "clay" | "lagoon" | "plum" | "night";
const TONES: Record<Tone, string> = {
  neutral: "bg-canvas-deep text-ink-soft",
  ember: "bg-ember-soft text-ember-deep",
  moss: "bg-moss-soft text-moss",
  saffron: "bg-saffron-soft text-saffron",
  clay: "bg-clay-soft text-clay",
  lagoon: "bg-lagoon-soft text-lagoon",
  plum: "bg-plum-soft text-plum",
  night: "bg-night text-night-text",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  dot,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: number }) {
  const { t } = useI18n();
  return status === 1 ? (
    <Badge tone="moss" dot>
      {t("启用")}
    </Badge>
  ) : (
    <Badge tone="clay" dot>
      {t("停用")}
    </Badge>
  );
}

/* ---------------- Field / Input / Select ---------------- */
export function Field({
  label,
  required,
  hint,
  error,
  children,
  className,
}: {
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      {label && (
        <span className="mb-1.5 flex items-center gap-1 text-[12.5px] font-semibold text-ink-soft">
          {label}
          {required && <span className="text-ember">*</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="mt-1 block text-[12px] text-clay">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-[12px] text-ink-faint">{hint}</span>
      )}
    </label>
  );
}

const fieldBase =
  "w-full rounded-[8px] border border-line bg-surface px-3.5 text-[13.5px] text-ink placeholder:text-ink-faint transition focus:border-ember focus:outline-none focus:ring-4 focus:ring-ember/10 disabled:bg-canvas-deep disabled:text-ink-mute";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(fieldBase, "h-10", invalid && "border-clay focus:border-clay focus:ring-clay/10", className)}
        {...rest}
      />
    );
  },
);

export function SearchInput({
  className,
  icon,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }) {
  return (
    <div className="relative">
      {icon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
          {icon}
        </span>
      )}
      <input className={cn(fieldBase, "h-10", icon && "pl-9", className)} {...rest} />
    </div>
  );
}

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(fieldBase, "h-10 cursor-pointer appearance-none pr-9", className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
    </div>
  );
});

/* ---------------- Checkbox ---------------- */
export function Checkbox({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn("group inline-flex items-center gap-2.5 text-left", className)}
    >
      <span
        className={cn(
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border transition-all",
          checked
            ? "border-ember bg-ember text-white"
            : "border-line-strong bg-surface group-hover:border-ink-mute",
        )}
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3.5} />}
      </span>
      {label && <span className="text-[13px] text-ink-soft">{label}</span>}
    </button>
  );
}

/* ---------------- Switch ---------------- */
export function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
        checked ? "bg-ember" : "bg-line-strong",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}

/* ---------------- Card ---------------- */
export function Card({
  className,
  children,
  hover,
  style,
}: {
  className?: string;
  children: ReactNode;
  hover?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={style}
      className={cn(
        "rounded-card border border-line bg-surface shadow-soft",
        hover && "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  desc,
  action,
  className,
}: {
  title: ReactNode;
  desc?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4", className)}>
      <div>
        <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
        {desc && <p className="mt-0.5 text-[12.5px] text-ink-mute">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------------- Avatar ---------------- */
export function Avatar({
  name,
  size = 36,
  className,
  src,
}: {
  name: string;
  size?: number;
  className?: string;
  src?: string | null;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold",
        avatarTone(name),
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(name)}
    </span>
  );
}

/* ---------------- Skeleton / Empty / Spinner ---------------- */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton-shimmer rounded-md", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("anim-spin text-ember", className)} />;
}

export function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon?: ReactNode;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="dotgrid relative flex flex-col items-center justify-center overflow-hidden rounded-card px-6 py-14 text-center">
      {icon && (
        <div className="relative mb-3">
          <span className="pointer-events-none absolute inset-0 -z-10 rounded-2xl bg-ember/10 blur-md" aria-hidden="true" />
          <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface text-ink-mute shadow-soft">
            {icon}
          </span>
        </div>
      )}
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      {desc && <p className="mt-1 max-w-xs text-[12.5px] text-ink-mute">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------------- Pagination ---------------- */
export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (p: number) => void;
}) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const nums: (number | "…")[] = [];
  const push = (n: number | "…") => nums.push(n);
  if (pages <= 7) {
    for (let i = 1; i <= pages; i++) push(i);
  } else {
    push(1);
    if (page > 3) push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) push(i);
    if (page < pages - 2) push("…");
    push(pages);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <span className="text-[12.5px] text-ink-mute">
        {t("显示 {from}–{to} 条，共 {total} 条", { from, to, total })}
      </span>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="h-8 rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-soft transition hover:border-ink-mute disabled:opacity-40 disabled:hover:border-line"
        >
          {t("上一页")}
        </button>
        {nums.map((n, i) =>
          n === "…" ? (
            <span key={`e${i}`} className="px-1.5 text-ink-faint">
              …
            </span>
          ) : (
            <button
              key={n}
              onClick={() => onChange(n)}
              className={cn(
                "num h-8 min-w-8 rounded-lg px-2 text-[12.5px] font-medium transition",
                n === page
                  ? "bg-ink text-canvas"
                  : "border border-line text-ink-soft hover:border-ink-mute",
              )}
            >
              {n}
            </button>
          ),
        )}
        <button
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          className="h-8 rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-soft transition hover:border-ink-mute disabled:opacity-40 disabled:hover:border-line"
        >
          {t("下一页")}
        </button>
      </div>
    </div>
  );
}

/* ---------------- Dropdown ---------------- */
export function Dropdown({
  trigger,
  children,
  align = "right",
  panelClass,
}: {
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  panelClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div
          className={cn(
            "anim-scale absolute z-40 mt-1.5 min-w-[180px] overflow-hidden rounded-[10px] border border-line bg-surface p-1 shadow-pop",
            align === "right" ? "right-0" : "left-0",
            panelClass,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  danger,
  onClick,
}: {
  icon?: ReactNode;
  children: ReactNode;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-left text-[13px] font-medium transition",
        danger ? "text-clay hover:bg-clay-soft" : "text-ink-soft hover:bg-canvas-deep hover:text-ink",
      )}
    >
      {icon && <span className="h-4 w-4 opacity-80">{icon}</span>}
      {children}
    </button>
  );
}
