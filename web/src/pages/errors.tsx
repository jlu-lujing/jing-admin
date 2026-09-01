import { Link } from "react-router-dom";
import { ShieldAlert, Compass } from "lucide-react";
import { Button, Badge } from "../components/ui/primitives";
import { useI18n } from "../lib/i18n";

export function Forbidden({ perm }: { perm?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="anim-rise relative mb-6">
        <div className="absolute inset-0 rounded-3xl bg-clay/15 blur-xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-surface text-clay shadow-soft">
          <ShieldAlert className="h-8 w-8" />
        </div>
      </div>
      <p className="anim-rise num text-[13px] font-semibold tracking-[0.3em] text-clay" style={{ animationDelay: "0.05s" }}>
        403
      </p>
      <h2 className="anim-rise mt-2 font-display text-[22px] font-bold tracking-tight text-ink" style={{ animationDelay: "0.1s" }}>
        {t("无权限访问")}
      </h2>
      <p className="anim-rise mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink-mute" style={{ animationDelay: "0.15s" }}>
        {t("当前角色缺少访问该页面所需的权限")}
        {perm && (
          <>
            ，{t("所需权限码")} <Badge tone="clay" className="mx-1 align-middle">{perm}</Badge>
          </>
        )}
        。{t("请联系超级管理员为你的角色授权。")}
      </p>
      <Link to="/" className="anim-rise" style={{ animationDelay: "0.2s" }}>
        <Button variant="outline" className="mt-6">
          {t("返回数据看板")}
        </Button>
      </Link>
    </div>
  );
}

export function NotFound() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="anim-rise relative mb-6">
        <div className="absolute inset-0 rounded-3xl bg-lagoon/15 blur-xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-surface text-lagoon shadow-soft">
          <Compass className="h-8 w-8" />
        </div>
      </div>
      <p className="anim-rise num text-[13px] font-semibold tracking-[0.3em] text-lagoon" style={{ animationDelay: "0.05s" }}>
        404
      </p>
      <h2 className="anim-rise mt-2 font-display text-[22px] font-bold tracking-tight text-ink" style={{ animationDelay: "0.1s" }}>
        {t("页面不存在")}
      </h2>
      <p className="anim-rise mt-2 text-[13.5px] text-ink-mute" style={{ animationDelay: "0.15s" }}>
        {t("你访问的路径可能已被移除或输入有误。")}
      </p>
      <Link to="/" className="anim-rise" style={{ animationDelay: "0.2s" }}>
        <Button variant="outline" className="mt-6">
          {t("返回首页")}
        </Button>
      </Link>
    </div>
  );
}
