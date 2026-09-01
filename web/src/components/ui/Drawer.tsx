import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

export function Drawer({
  open,
  onClose,
  title,
  desc,
  children,
  footer,
  width = 420,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  desc?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[90]">
      <div className="anim-fade absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        className="anim-slide-in absolute inset-y-0 right-0 flex flex-col border-l border-line bg-surface shadow-pop"
        style={{ width: `min(${width}px, 92vw)` }}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line-soft px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-display text-[15.5px] font-semibold tracking-tight text-ink">{title}</h2>
            {desc && <p className="mt-0.5 truncate text-[12px] text-ink-mute">{desc}</p>}
          </div>
          <button onClick={onClose} className="-mr-1.5 rounded-lg p-1.5 text-ink-mute transition hover:bg-canvas-deep hover:text-ink" aria-label="close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className={cn("flex-1 overflow-y-auto px-5 py-4")}>{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line-soft px-5 py-3.5">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

export function DrawerSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <p className="mb-2 text-[10px] font-semibold tracking-[0.16em] text-ink-faint uppercase">{label}</p>
      {children}
    </section>
  );
}

export function DrawerField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-[5px]">
      <span className="text-[12px] text-ink-mute">{label}</span>
      <span className="min-w-0 truncate text-right text-[12.5px] font-medium text-ink">{value || "—"}</span>
    </div>
  );
}
