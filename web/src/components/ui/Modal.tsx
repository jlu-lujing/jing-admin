import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, AlertTriangle } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./primitives";

export function Modal({
  open,
  onClose,
  title,
  desc,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  desc?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  const width = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" }[size];

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto p-4 py-[7vh]">
      <div className="anim-fade fixed inset-0 bg-night/45 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "anim-scale relative w-full rounded-[14px] border border-line bg-surface shadow-pop",
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-6 py-4">
          <div>
            <h2 className="font-display text-[16.5px] font-semibold tracking-tight text-ink">{title}</h2>
            {desc && <p className="mt-0.5 text-[12.5px] text-ink-mute">{desc}</p>}
          </div>
          <button
            onClick={onClose}
            className="-mr-2 rounded-lg p-1.5 text-ink-mute transition hover:bg-canvas-deep hover:text-ink"
            aria-label="关闭"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="max-h-[62vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2.5 border-t border-line-soft px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  desc,
  confirmText = "确认",
  danger = true,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  desc?: ReactNode;
  confirmText?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {danger && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-clay-soft text-clay">
            <AlertTriangle className="h-5 w-5" />
          </div>
        )}
        <p className="pt-1 text-[13.5px] leading-relaxed text-ink-soft">{desc}</p>
      </div>
    </Modal>
  );
}
