import { useI18n } from "../../lib/i18n";
import { cn } from "../../lib/utils";

export function PasswordStrength({ value }: { value: string }) {
  const { t } = useI18n();
  if (!value) return null;

  let score = 0;
  if (value.length >= 6) score++;
  if (value.length >= 10) score++;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(value)).length;
  if (classes >= 3) score++;
  if (classes >= 4) score++;

  const level = score <= 1 ? 0 : score <= 2 ? 1 : score === 3 ? 2 : 3;
  const meta = [
    { label: t("弱"), color: "var(--c-clay)", width: "25%" },
    { label: t("中"), color: "var(--c-saffron)", width: "55%" },
    { label: t("强"), color: "var(--c-moss)", width: "82%" },
    { label: t("极强"), color: "var(--c-moss)", width: "100%" },
  ][level];

  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-canvas-deep">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: meta.width, background: meta.color }} />
      </div>
      <span className={cn("text-[10.5px] font-semibold")} style={{ color: meta.color }}>
        {meta.label}
      </span>
    </div>
  );
}
