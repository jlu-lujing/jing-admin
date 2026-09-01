import { create } from "zustand";
import { useEffect } from "react";
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "lucide-react";
import { cn } from "../../lib/utils";

type ToastKind = "success" | "error" | "info" | "warning";
interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  desc?: string;
}
interface ToastState {
  items: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  remove: (id: number) => void;
}

let seq = 0;
const useToasts = create<ToastState>((set) => ({
  items: [],
  push: (t) => set((s) => ({ items: [...s.items, { ...t, id: ++seq }] })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

export function toast(title: string, opts?: { kind?: ToastKind; desc?: string }) {
  useToasts.getState().push({ kind: opts?.kind ?? "success", title, desc: opts?.desc });
}
toast.error = (t: string, d?: string) => toast(t, { kind: "error", desc: d });
toast.info = (t: string, d?: string) => toast(t, { kind: "info", desc: d });
toast.warning = (t: string, d?: string) => toast(t, { kind: "warning", desc: d });

const ICONS: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};
const RING: Record<ToastKind, string> = {
  success: "text-moss",
  error: "text-clay",
  info: "text-lagoon",
  warning: "text-saffron",
};
const BAR: Record<ToastKind, string> = {
  success: "bg-moss",
  error: "bg-clay",
  info: "bg-lagoon",
  warning: "bg-saffron",
};
const DURATION = 4200;

export function Toaster() {
  const items = useToasts((s) => s.items);
  return (
    <div className="fixed top-5 right-5 z-[100] flex w-[min(92vw,380px)] flex-col gap-2.5">
      {items.map((t) => (
        <ToastRow key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastRow({ toast: t }: { toast: Toast }) {
  const remove = useToasts((s) => s.remove);
  useEffect(() => {
    const id = setTimeout(() => remove(t.id), DURATION);
    return () => clearTimeout(id);
  }, [t.id, remove]);
  const Icon = ICONS[t.kind];
  return (
    <div
      role="status"
      className="anim-toast relative w-[min(92vw,360px)] overflow-hidden rounded-[10px] border border-line bg-surface px-3.5 py-3 shadow-pop"
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", RING[t.kind])} strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold leading-snug text-ink">{t.title}</p>
          {t.desc && <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-ink-mute">{t.desc}</p>}
        </div>
        <button
          onClick={() => remove(t.id)}
          className="-m-1 shrink-0 rounded-md p-1 text-ink-faint transition hover:bg-canvas-deep hover:text-ink"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-line-soft">
        <div className={cn("h-full origin-left", BAR[t.kind])} style={{ animation: "toast-progress 4.2s linear forwards" }} />
      </div>
    </div>
  );
}
