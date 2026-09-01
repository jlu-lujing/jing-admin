import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-separate border-spacing-0 text-left [&>tbody>tr:nth-child(even)]:[--c-row:var(--c-stripe)]">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "sticky top-0 z-10 border-b border-line bg-surface-2 px-5 py-3 text-[11px] font-semibold tracking-[0.12em] text-ink-mute uppercase whitespace-nowrap",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={cn("border-b border-line-soft px-5 py-3.5 text-[13px] text-ink-soft align-middle", className)}>
      {children}
    </td>
  );
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("group bg-[var(--c-row)] transition-colors hover:bg-[var(--c-row-hover)]", className)}>{children}</tr>;
}
