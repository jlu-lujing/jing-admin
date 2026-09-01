import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, KeyRound, ShieldCheck, Mail, Building2, Briefcase, Camera, MonitorSmartphone, ShieldHalf, Copy, CheckCircle2 } from "lucide-react";
import { get, put } from "../lib/api";
import type { SessionInfo } from "../lib/types";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import type { CurrentUser } from "../lib/types";
import { PageHeader } from "../components/layout";
import { PasswordStrength } from "../components/ui/PasswordStrength";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
} from "../components/ui/primitives";
import { toast } from "../components/ui/Toast";

export default function Profile() {
  const { t } = useI18n();
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const qc = useQueryClient();

  const [profile, setProfile] = useState({
    nickname: user?.nickname ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
  });
  const [pw, setPw] = useState({ oldPassword: "", newPassword: "", confirm: "" });
  const [pwErr, setPwErr] = useState<string | undefined>();

  const profileMut = useMutation({
    mutationFn: () => put<CurrentUser>("/profile", profile),
    onSuccess: (fresh) => {
      setUser(fresh);
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
      toast(t("个人资料已保存"));
    },
    onError: (e) => toast.error(t("保存失败"), e instanceof Error ? e.message : undefined),
  });

  const navigate = useNavigate();
  const { data: sessions } = useQuery({
    queryKey: ["sessions-profile"],
    queryFn: () => get<SessionInfo[]>("/sessions"),
  });

  const avatarMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads/avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${useAuth.getState().accessToken}` },
        body: fd,
      });
      const body = await res.json();
      if (body.code !== 0) throw new Error(body.message);
      return body.data.avatar as string;
    },
    onSuccess: (url) => {
      if (user) setUser({ ...user, avatar: url });
      toast(t("头像已更新"));
    },
    onError: (e) => toast.error(t("上传失败"), e instanceof Error ? e.message : undefined),
  });

  const pwMut = useMutation({
    mutationFn: () => put("/profile/password", { oldPassword: pw.oldPassword, newPassword: pw.newPassword }),
    onSuccess: () => {
      setPw({ oldPassword: "", newPassword: "", confirm: "" });
      toast(t("密码已更新"), { desc: t("下次登录请使用新密码") });
    },
    onError: (e) => toast.error(t("修改失败"), e instanceof Error ? e.message : undefined),
  });

  if (!user) return null;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Account" title={t("个人设置")} desc={t("管理你的公开资料与登录凭据，资料会同步展示在成员列表中。")} />

      {/* identity banner */}
      <Card className="anim-rise relative overflow-hidden p-6">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 88% 10%, rgba(37,99,235,0.10), transparent 38%), radial-gradient(circle at 6% 92%, rgba(8,145,178,0.08), transparent 32%)",
          }}
        />
        <div className="relative flex flex-wrap items-center gap-5">
          <div className="relative">
            <Avatar name={user.nickname || user.username} size={68} src={user.avatar} />
            <label className="absolute -right-1 -bottom-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border-2 border-surface bg-ember text-white shadow-ember transition hover:bg-ember-deep">
              <Camera className="h-3 w-3" />
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) avatarMut.mutate(f);
                }}
              />
            </label>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="font-display text-[20px] font-bold tracking-tight text-ink">
                {user.nickname || user.username}
              </h3>
              {user.roles.map((r) => (
                <Badge key={r} tone={r.includes("超级") ? "ember" : "lagoon"} dot>
                  {r}
                </Badge>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-ink-mute">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> {user.dept ? t(user.dept) : t("未设置部门")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" /> {user.position || t("未设置职位")}
              </span>
              <span className="num inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> {user.email || t("未设置邮箱")}
              </span>
            </div>
          </div>
          <div className="rounded-[12px] border border-line bg-surface-2 px-4 py-3 text-right">
            <p className="text-[10.5px] tracking-[0.18em] text-ink-faint uppercase">Permissions</p>
            <p className="num mt-0.5 text-[22px] leading-none font-bold text-ember">{user.permissions.length}</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* profile form */}
        <Card className="anim-rise" style={{ animationDelay: "0.06s" }}>
          <CardHeader title={t("基本资料")} desc={t("昵称与联系方式将展示给其他成员")} />
          <div className="space-y-4 p-5">
            <Field label={t("昵称")} required>
              <Input value={profile.nickname} onChange={(e) => setProfile((p) => ({ ...p, nickname: e.target.value }))} />
            </Field>
            <Field label={t("邮箱")}>
              <Input value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} />
            </Field>
            <Field label={t("手机号")}>
              <Input
                value={profile.phone}
                onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value.replace(/[^\d-]/g, "") }))}
                inputMode="tel"
              />
            </Field>
            <div className="flex justify-end pt-1">
              <Button
                variant="primary"
                loading={profileMut.isPending}
                disabled={!profile.nickname.trim()}
                icon={<Save className="h-4 w-4" />}
                onClick={() => profileMut.mutate()}
              >
                {t("保存资料")}
              </Button>
            </div>
          </div>
        </Card>

        {/* password */}
        <Card className="anim-rise" style={{ animationDelay: "0.1s" }}>
          <CardHeader title={t("修改密码")} desc={t("修改后当前登录会话仍然有效")} />
          <div className="space-y-4 p-5">
            <Field label={t("当前密码")} required>
              <Input
                type="password"
                autoComplete="current-password"
                value={pw.oldPassword}
                onChange={(e) => setPw((p) => ({ ...p, oldPassword: e.target.value }))}
                placeholder={t("验证身份")}
              />
            </Field>
            <Field label={t("新密码")} required error={pwErr} hint={t("至少 6 位，建议包含字母与数字")}>
              <div>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={pw.newPassword}
                  onChange={(e) => {
                    setPwErr(undefined);
                    setPw((p) => ({ ...p, newPassword: e.target.value }));
                  }}
                  placeholder="••••••••"
                />
                <PasswordStrength value={pw.newPassword} />
              </div>
            </Field>
            <Field label={t("确认新密码")} required>
              <Input
                type="password"
                autoComplete="new-password"
                value={pw.confirm}
                onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
                placeholder={t("再次输入新密码")}
              />
            </Field>
            <div className="flex justify-end pt-1">
              <Button
                variant="ember"
                loading={pwMut.isPending}
                icon={<KeyRound className="h-4 w-4" />}
                onClick={() => {
                  if (pw.newPassword.length < 6) return setPwErr(t("新密码至少 6 位"));
                  if (pw.newPassword !== pw.confirm) return setPwErr(t("两次输入不一致"));
                  setPwErr(undefined);
                  pwMut.mutate();
                }}
              >
                {t("更新密码")}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* permissions */}
      <Card className="anim-rise" style={{ animationDelay: "0.14s" }}>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-ember" />
              {t("我的权限")}
            </span>
          }
          desc={t("由所属角色决定，如需调整请联系管理员")}
        />
        <div className="flex flex-wrap gap-2 p-5">
          {user.permissions.length === 0 ? (
            <span className="text-[13px] text-ink-mute">{t("当前角色未分配任何权限")}</span>
          ) : (
            user.permissions.map((p) => (
              <Badge key={p} tone="neutral" className="num px-3 py-1">
                {p}
              </Badge>
            ))
          )}
        </div>
      </Card>
      <TotpCard />

      <Card className="anim-rise" style={{ animationDelay: "0.18s" }}>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <MonitorSmartphone className="h-4 w-4 text-lagoon" />
              {t("登录设备")}
            </span>
          }
          desc={t("检测到你当前的活跃会话")}
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate("/sessions")}>
              {t("管理会话")}
            </Button>
          }
        />
        <div className="flex flex-wrap gap-3 p-5">
          {(sessions ?? []).slice(0, 4).map((sess: SessionInfo) => (
            <div key={sess.id} className="flex items-center gap-2.5 rounded-[10px] border border-line bg-surface-2 px-3.5 py-2.5">
              <MonitorSmartphone className="h-4 w-4 text-ink-mute" />
              <div>
                <p className="num text-[12px] font-medium text-ink">IP {sess.ip || "—"}</p>
                <p className="text-[10.5px] text-ink-faint">{sess.isCurrent ? t("当前设备") : t("历史会话")}</p>
              </div>
            </div>
          ))}
          {(sessions ?? []).length === 0 && <p className="text-[12.5px] text-ink-mute">{t("暂无其他设备会话")}</p>}
        </div>
      </Card>
    </div>
  );
}

function TotpCard() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [code, setCode] = useState("");
  const [disablePw, setDisablePw] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: status } = useQuery({ queryKey: ["totp"], queryFn: () => get<{ enabled: boolean }>("/totp") });
  const startSetup = useMutation({
    mutationFn: () => get<{ secret: string; otpauth: string }>("/totp"),
    onSuccess: setSetup,
    onError: (e) => toast.error(t("操作失败"), e instanceof Error ? e.message : undefined),
  });
  const enable = useMutation({
    mutationFn: () => put("/totp/enable", { secret: setup!.secret, code }),
    onSuccess: () => {
      toast(t("两步验证已开启"));
      setSetup(null);
      setCode("");
      qc.invalidateQueries({ queryKey: ["totp"] });
    },
    onError: (e) => toast.error(t("开启失败"), e instanceof Error ? e.message : undefined),
  });
  const disable = useMutation({
    mutationFn: () => put("/totp/disable", { password: disablePw }),
    onSuccess: () => {
      toast(t("两步验证已关闭"));
      setDisablePw("");
      qc.invalidateQueries({ queryKey: ["totp"] });
    },
    onError: (e) => toast.error(t("关闭失败"), e instanceof Error ? e.message : undefined),
  });

  return (
    <Card className="anim-rise" style={{ animationDelay: "0.16s" }}>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <ShieldHalf className="h-4 w-4 text-plum" />
            {t("两步验证 (TOTP)")}
          </span>
        }
        desc={t("登录时额外校验身份验证器 6 位动态码，保护高权限账号")}
        action={
          status?.enabled ? (
            <Badge tone="moss" dot>{t("已开启")}</Badge>
          ) : (
            <Badge tone="neutral">{t("未开启")}</Badge>
          )
        }
      />
      <div className="space-y-4 p-5">
        {status?.enabled && !setup && (
          <div className="flex items-center gap-2">
            <Input
              type="password"
              value={disablePw}
              onChange={(e) => setDisablePw(e.target.value)}
              placeholder={t("输入当前密码以关闭")}
              className="max-w-64"
            />
            <Button variant="outline" size="sm" className="text-clay" disabled={!disablePw} loading={disable.isPending} onClick={() => disable.mutate()}>
              {t("关闭")}
            </Button>
          </div>
        )}
        {!status?.enabled && !setup && (
          <Button variant="primary" size="sm" loading={startSetup.isPending} onClick={() => startSetup.mutate()}>
            {t("开启两步验证")}
          </Button>
        )}
        {setup && (
          <div className="space-y-3">
            <p className="text-[12.5px] text-ink-mute">{t("在身份验证器 App 中输入以下密钥，动态码每 30 秒刷新")}</p>
            <div className="flex items-center gap-2 rounded-[10px] border border-line bg-surface-2 p-2.5">
              <code className="num min-w-0 flex-1 break-all text-[12.5px] font-semibold text-ink">{setup.secret}</code>
              <Button
                size="sm"
                variant="ghost"
                icon={copied ? <CheckCircle2 className="h-3.5 w-3.5 text-moss" /> : <Copy className="h-3.5 w-3.5" />}
                onClick={() => {
                  navigator.clipboard?.writeText(setup.secret);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {t("复制")}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder={t("6 位动态码")}
                inputMode="numeric"
                className="num max-w-40 tracking-[0.4em]"
              />
              <Button variant="ember" size="sm" disabled={code.length !== 6} loading={enable.isPending} onClick={() => enable.mutate()}>
                {t("验证并开启")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
