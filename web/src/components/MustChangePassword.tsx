import { useState } from "react";
import { createPortal } from "react-dom";
import { KeyRound, LogOut } from "lucide-react";
import { put } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { Button, Field, Input } from "./ui/primitives";
import { PasswordStrength } from "./ui/PasswordStrength";
import { toast } from "./ui/Toast";

/** 密码过期/首登强制改密拦截层（服务端 mustChangePassword 驱动） */
export function MustChangeGate() {
  const { t } = useI18n();
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const clear = useAuth((s) => s.clear);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  if (!user?.mustChangePassword) return null;

  const mismatch = confirm.length > 0 && confirm !== newPw;

  const submit = async () => {
    setBusy(true);
    setErr(undefined);
    try {
      await put("/profile/password", { oldPassword: oldPw, newPassword: newPw });
      setUser({ ...user, mustChangePassword: false });
      toast(t("密码已更新，可正常使用系统"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-night/80 p-4 backdrop-blur-sm">
      <div className="anim-scale w-full max-w-[400px] rounded-[16px] border border-line bg-surface p-6 shadow-pop">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-saffron-soft text-saffron">
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-[16px] font-bold text-ink">{t("需要更新密码")}</h2>
            <p className="text-[12px] text-ink-mute">{t("你的密码已过期或为初始密码，修改后继续")}</p>
          </div>
        </div>

        <div className="space-y-3.5">
          <Field label={t("当前密码")}>
            <Input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label={t("新密码")}>
            <div>
              <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
              <PasswordStrength value={newPw} />
            </div>
          </Field>
          <Field label={t("确认新密码")} error={mismatch ? t("两次输入不一致") : err}>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            icon={<LogOut className="h-3.5 w-3.5" />}
            onClick={() => {
              clear();
              window.dispatchEvent(new Event("jing:logout"));
            }}
          >
            {t("退出登录")}
          </Button>
          <Button variant="ember" loading={busy} disabled={!oldPw || !newPw || confirm !== newPw} onClick={submit}>
            {t("更新密码")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
