import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, ArrowRight, ShieldCheck, Zap, Layers, KeyRound } from "lucide-react";
import { Button, Field, Input } from "../components/ui/primitives";
import { toast } from "../components/ui/Toast";
import { get, post } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { LoginResult, OauthStatus } from "../lib/types";
import { cn } from "../lib/utils";
import { useI18n } from "../lib/i18n";
import { resolveTheme, useTheme } from "../lib/theme";

const DEMO_ACCOUNTS = [
  { label: "超级管理员", username: "admin", password: "admin123", desc: "全权限" },
  { label: "系统管理员", username: "demo", password: "demo123", desc: "用户/角色" },
  { label: "安全审计员", username: "auditor", password: "audit123", desc: "只读审计" },
];

const FEATURES = [
  { icon: ShieldCheck, title: "细粒度 RBAC", desc: "角色 × 权限码双重管控，前后端同步鉴权" },
  { icon: Zap, title: "Axum 高性能内核", desc: "Rust 异步运行时，毫秒级 JWT 鉴权链路" },
  { icon: Layers, title: "企业级审计", desc: "全量操作留痕，登录与变更可追溯" },
];

function LangToggleMini() {
  const { lang, setLang } = useI18n();
  return (
    <button
      onClick={() => setLang(lang === "zh" ? "en" : "zh")}
      className="ml-2 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-mute transition hover:text-ink"
    >
      {lang === "zh" ? "English" : "中文"}
    </button>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const mode = useTheme((s) => s.mode);
  const setMode = useTheme((s) => s.setMode);
  const setSession = useAuth((s) => s.setSession);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [needTotp, setNeedTotp] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);
  const [oauth, setOauth] = useState<OauthStatus>({ enabled: false, provider: "none" });

  useEffect(() => {
    // SSO 回跳：/login#sso=<access>.<refresh>
    const hash = window.location.hash;
    if (hash.startsWith("#sso=")) {
      const [access, refresh] = hash.slice(5).split(".");
      if (access && refresh) {
        fetch("/api/auth/me", { headers: { Authorization: `Bearer ${access}` } })
          .then((r) => r.json())
          .then((body) => {
            if (body.code === 0) {
              setSession({ accessToken: access, refreshToken: refresh, user: body.data });
              history.replaceState(null, "", "/login");
              navigate("/", { replace: true });
            }
          })
          .catch(() => {});
      }
    }
    get<OauthStatus>("/auth/oauth/status").then(setOauth).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.body.style.background = "var(--color-night)";
    return () => {
      document.body.style.background = "";
    };
  }, []);

  const usernameOk = username.trim().length > 0;
  const passwordOk = password.length > 0;
  const canSubmit = usernameOk && passwordOk && !loading;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    setLoading(true);
    try {
      const data = await post<LoginResult>("/auth/login", { username, password, code: totpCode || undefined });
      setSession(data);
      toast(`${t("欢迎回来，")} ${data.user.nickname || data.user.username}`);
      navigate("/", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.startsWith("NEED_TOTP:")) {
        setNeedTotp(true);
        toast.info(msg.slice("NEED_TOTP:".length));
      } else {
        toast.error(t("登录失败"), msg || undefined);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      {/* ---------- Left: ink brand panel ---------- */}
      <div className="on-night relative hidden overflow-hidden bg-night px-14 py-12 lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 20%, color-mix(in srgb, var(--c-ember-glow) 34%, transparent), transparent 42%), radial-gradient(circle at 82% 88%, color-mix(in srgb, var(--c-ember) 18%, transparent), transparent 40%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
            backgroundSize: "54px 54px",
          }}
        />

        <div className="relative anim-rise">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-gradient-to-br from-ember-glow to-ember-deep shadow-ember">
              <span className="font-display text-[18px] leading-none font-extrabold text-white">J</span>
            </div>
            <div className="leading-none">
              <p className="font-display text-[18px] font-extrabold tracking-tight text-white">
                Jing<span className="text-ember-glow">Admin</span>
              </p>
              <p className="mt-1 text-[10px] tracking-[0.24em] text-night-dim uppercase">Enterprise Suite</p>
            </div>
          </div>
        </div>

        <div className="relative max-w-md">
          <p className="anim-rise mb-5 font-display text-[12px] font-semibold tracking-[0.3em] text-ember-glow uppercase" style={{ animationDelay: "0.08s" }}>
            {t("Rust × React 全栈驱动")}
          </p>
          <h1 className="anim-rise font-display text-[46px] leading-[1.08] font-extrabold tracking-tight text-white" style={{ animationDelay: "0.14s" }}>
            {t("镜映全局，")}
            <br />
            {t("掌控每一处")}
            <span className="text-ember-glow">{t("细节")}。</span>
          </h1>
          <p className="anim-rise mt-5 text-[15px] leading-relaxed text-night-text" style={{ animationDelay: "0.22s" }}>
            {t("以 Rust 高性能后端驱动，面向中大型团队的统一权限管控与运营审计平台。")}
          </p>

          <div className="mt-10 space-y-4">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="anim-rise flex items-start gap-3.5"
                style={{ animationDelay: `${0.3 + i * 0.08}s` }}
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-night-line bg-night-2 text-ember-glow">
                  <f.icon className="h-[18px] w-[18px]" strokeWidth={2} />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-white">{t(f.title)}</p>
                  <p className="mt-0.5 text-[12.5px] text-night-dim">{t(f.desc)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="anim-rise relative num text-[11.5px] text-night-dim" style={{ animationDelay: "0.45s" }}>
          © {new Date().getFullYear()} JingAdmin · Built with Axum, React & Tailwind
        </p>
      </div>

      {/* ---------- Right: form ---------- */}
      <div className="flex flex-col justify-center bg-canvas px-7 py-12 sm:px-14">
        <div className="mx-auto w-full max-w-[380px]">
          <div className="mb-6 flex justify-end">
            <button
              onClick={() => {
                const next = resolveTheme(mode) === "dark" ? "light" : "dark";
                setMode(next);
              }}
              className="rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-mute transition hover:text-ink"
            >
              {resolveTheme(mode) === "dark" ? t("浅色模式") : t("深色模式")}
            </button>
            <LangToggleMini />
          </div>

          {/* mobile brand */}
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-gradient-to-br from-ember-glow to-ember-deep shadow-ember">
              <span className="font-display text-[18px] leading-none font-extrabold text-white">J</span>
            </div>
            <p className="font-display text-[18px] font-extrabold tracking-tight text-ink">
              Jing<span className="text-ember">Admin</span>
            </p>
          </div>

          <div className="anim-rise">
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink-mute">
              <KeyRound className="h-3.5 w-3.5 text-ember" />
              {t("安全登录")}
            </div>
            <h2 className="mt-3 font-display text-[26px] font-bold tracking-tight text-ink">
              {t("登录管控台")}
            </h2>
            <p className="mt-1.5 text-[13.5px] text-ink-mute">
              {t("使用企业账号登录，或选择下方演示账户快速体验。")}
            </p>
          </div>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div className="anim-rise space-y-4" style={{ animationDelay: "0.05s" }}>
              <Field label={t("用户名")} required error={touched && !usernameOk ? t("请输入用户名") : undefined}>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                  invalid={touched && !usernameOk}
                />
              </Field>

              <Field label={t("密码")} required error={touched && !passwordOk ? t("请输入密码") : undefined}>
                <div className="relative">
                  <Input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="pr-11"
                    invalid={touched && !passwordOk}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint transition hover:text-ink-soft"
                    aria-label={showPw ? t("隐藏密码") : t("显示密码")}
                  >
                    {showPw ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
              </Field>
            </div>

            {needTotp && (
              <Field label={t("动态验证码")} required hint={t("打开身份验证器 App，输入 6 位动态码")}>
                <Input
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  className="num tracking-[0.5em]"
                  inputMode="numeric"
                  autoFocus
                />
              </Field>
            )}
            <Button
              type="submit"
              variant="ember"
              size="lg"
              className="w-full anim-rise"
              loading={loading}
              disabled={!canSubmit}
              icon={!loading ? <ArrowRight className="h-4 w-4" /> : undefined}
              style={{ animationDelay: "0.1s" }}
            >
              {loading ? t("正在验证…") : t("登录系统")}
            </Button>
          </form>

          {oauth.enabled && (
            <div className="mt-4">
              <div className="mb-3 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="text-[11px] font-medium text-ink-faint">{t("或")}</span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => {
                  window.location.href = "/api/auth/oauth/login";
                }}
              >
                SSO · {oauth.provider} {t("单点登录")}
              </Button>
            </div>
          )}

          {/* demo accounts */}
          <div className="anim-rise mt-8" style={{ animationDelay: "0.18s" }}>
            <div className="mb-3 flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-[11px] font-medium tracking-wide text-ink-faint">演示账户 · 点击填充</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <div className="space-y-2">
              {DEMO_ACCOUNTS.map((a) => {
                const active = username === a.username;
                return (
                  <button
                    key={a.username}
                    type="button"
                    onClick={() => {
                      setUsername(a.username);
                      setPassword(a.password);
                    }}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-[12px] border bg-surface px-3.5 py-3 text-left transition-all",
                      active
                        ? "border-ember shadow-ember"
                        : "border-line hover:border-line-strong hover:shadow-soft",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] font-display text-[12px] font-bold transition-colors",
                        active ? "bg-ember text-white" : "bg-canvas-deep text-ink-soft group-hover:bg-ember-soft group-hover:text-ember-deep",
                      )}
                    >
                      {a.username.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-ink">{a.label}</span>
                      <span className="num block text-[11.5px] text-ink-mute">
                        {a.username} / {a.password}
                      </span>
                    </span>
                    <span className="rounded-full bg-canvas-deep px-2 py-0.5 text-[10.5px] font-medium text-ink-mute">
                      {t(a.desc)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
