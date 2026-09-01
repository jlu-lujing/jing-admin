import { useQuery } from "@tanstack/react-query";
import {
  Users,
  UserCheck,
  ShieldCheck,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  PieChart,
  BarChart3,
  History,
} from "lucide-react";
import { get } from "../lib/api";
import { useState } from "react";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { useCountUp } from "../lib/useCountUp";
import type { DashboardData } from "../lib/types";
import { cn, greeting } from "../lib/utils";

import { Avatar, Badge, Card, CardHeader, Skeleton } from "../components/ui/primitives";
import { AreaChart, DonutChart, HBars } from "../components/charts";

const METHOD_TONE: Record<string, "ember" | "moss" | "lagoon" | "clay" | "saffron" | "neutral"> = {
  GET: "lagoon",
  POST: "moss",
  PUT: "saffron",
  DELETE: "clay",
};

export default function Dashboard() {
  const user = useAuth((s) => s.user);
  const { t } = useI18n();
  const [days, setDays] = useState(7);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["dashboard", days],
    queryFn: () => get<DashboardData>("/dashboard/overview", { days }),
    placeholderData: (p) => p,
  });

  if (isLoading) return <DashboardSkeleton />;
  if (!data) return null;

  const activeRate = data.userCount ? Math.round((data.activeCount / data.userCount) * 100) : 0;
  const trend = data.weeklyTrend.map((t) => t.value);
  const peak = Math.max(...trend, 1);
  const first = trend.slice(0, 3).reduce((s, v) => s + v, 0);
  const last = trend.slice(-3).reduce((s, v) => s + v, 0);
  const delta = first === 0 ? (last > 0 ? 100 : 0) : Math.round(((last - first) / first) * 100);

  const stats = [
    {
      label: t("系统用户"),
      value: data.userCount,
      icon: Users,
      tone: "ember" as const,
      foot: t("活跃率 {n}%", { n: activeRate }),
      trend: +8,
    },
    {
      label: t("活跃用户"),
      value: data.activeCount,
      icon: UserCheck,
      tone: "moss" as const,
      foot: t("{n} 个已停用", { n: data.userCount - data.activeCount }),
      trend: +3,
    },
    {
      label: t("角色数量"),
      value: data.roleCount,
      icon: ShieldCheck,
      tone: "lagoon" as const,
      foot: t("覆盖全部门"),
      trend: 0,
    },
    {
      label: t("审计事件"),
      value: data.requestCount,
      icon: Activity,
      tone: "plum" as const,
      foot: t("近两周持续记录"),
      trend: delta,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="anim-rise relative overflow-hidden rounded-card border border-line bg-surface shadow-soft">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(115deg, color-mix(in srgb, var(--c-ember) 9%, transparent) 0%, transparent 42%), radial-gradient(420px 180px at 92% -40%, color-mix(in srgb, var(--c-ember-glow) 16%, transparent), transparent 70%)",
          }}
        />
        <div className="dotgrid pointer-events-none absolute inset-y-0 right-0 w-[38%] opacity-40" />
        <div className="relative flex flex-wrap items-center justify-between gap-4 px-6 py-6">
          <div>
            <p className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/70 px-2.5 py-1 text-[10.5px] font-semibold tracking-[0.16em] text-ink-mute uppercase backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-moss anim-pulse" />
              {t("系统在线")}
            </p>
            <h2 className="font-display text-[29px] leading-tight font-bold tracking-tight text-ink">
              {t(greeting())}，{user?.nickname || user?.username}
              <span className="text-ember">.</span>
            </h2>
            <p className="mt-1.5 text-[13.5px] text-ink-mute">{t("系统运行总览与近期关键操作，数据实时来自 Axum 内核。")}</p>
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <span className="num text-[13px] font-semibold text-ink-soft">
              {new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", weekday: "long" })}
            </span>
            <span className="num text-[11.5px] tracking-wide text-ink-faint">
              Axum · React 18 · v0.3
            </span>
          </div>
        </div>
      </section>

      {/* stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s, i) => (
          <StatCard key={s.label} stat={s} index={i} spark={i === 3 ? trend : undefined} />
        ))}
      </div>

      {/* charts row */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="anim-rise xl:col-span-2" >
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-ember" />
                {t("近 7 日请求趋势")}
              </span>
            }
            desc={t("峰值 {n} 次 / 日", { n: peak })}
            action={
              <div className={cn("flex items-center gap-1 rounded-full border border-line bg-canvas p-0.5 transition-opacity", isFetching && "opacity-50")}>
                {[7, 14, 30].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={cn(
                      "num rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all",
                      days === d ? "bg-surface text-ember shadow-soft" : "text-ink-mute hover:text-ink",
                    )}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            }
          />
          <div className="p-4">
            <AreaChart data={data.weeklyTrend} height={260} />
          </div>
        </Card>

        <Card className="anim-rise">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <PieChart className="h-4 w-4 text-lagoon" />
                {t("部门人员分布")}
              </span>
            }
            desc={t("按在册用户统计")}
          />
          <div className="p-5">
            <DonutChart data={data.deptDistribution} totalLabel={t("成员")} />
          </div>
        </Card>
      </div>

      {/* secondary row */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="anim-rise">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-moss" />
                {t("操作类型 TOP")}
              </span>
            }
            desc={t("按事件次数排序")}
          />
          <div className="p-5">
            <HBars data={data.actionDistribution} />
          </div>
        </Card>

        <Card className="anim-rise xl:col-span-2">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <History className="h-4 w-4 text-plum" />
                {t("最近操作动态")}
              </span>
            }
            desc={t("实时同步审计日志")}
          />
          <ul className="relative divide-y divide-line-soft">
            <span className="absolute top-7 bottom-7 left-[35px] w-px bg-line" aria-hidden />
            {data.recentActivities.slice(0, 6).map((a) => (
              <li key={a.id} className="relative flex items-center gap-3 px-5 py-3">
                <Avatar name={a.username} size={30} className="z-[1] ring-2 ring-surface" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-ink">
                    <span className="font-semibold">{a.username}</span>
                    <span className="text-ink-mute"> · {a.action}</span>
                  </p>
                  <p className="truncate text-[11.5px] text-ink-faint">{a.detail}</p>
                </div>
                <Badge tone={METHOD_TONE[a.method] ?? "neutral"}>{a.method}</Badge>
                <span className="num hidden shrink-0 text-[11.5px] text-ink-mute sm:block relative" title={a.createdAt}>
                  {timeAgo(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function MiniSpark({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const max = Math.max(...points, 1);
  const w = 72;
  const h = 26;
  const d = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[26px] w-[72px]" preserveAspectRatio="none">
      <path d={`${d} L${w},${h} L0,${h} Z`} style={{ fill: "var(--c-ember)" }} opacity="0.08" />
      <path d={d} fill="none" style={{ stroke: "var(--c-ember)" }} strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

function StatCard({ stat, index, spark }: { stat: Stats; index: number; spark?: number[] }) {
  const n = useCountUp(stat.value);
  return (
    <Card
      hover
      className="anim-rise card-edge group relative overflow-hidden p-5"
      style={{ animationDelay: `${index * 0.06}s` }}
    >
      <span className="card-edge pointer-events-none absolute inset-x-0 top-0" aria-hidden="true" />
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.06]", TONE_BG[stat.tone])}>
        <stat.icon className={cn("h-[18px] w-[18px]", TONE_TEXT[stat.tone])} strokeWidth={2.2} />
      </div>
      <p className="num mt-5 text-[30px] leading-none font-bold tracking-[-0.04em] text-ink">
        {n.toLocaleString()}
      </p>
      <p className="mt-2.5 text-[12px] font-semibold tracking-wide text-ink-soft">
        {stat.label}
      </p>
      <div className="mt-3.5 flex min-h-6 items-center justify-between gap-2 border-t border-line-soft pt-3">
        <p className="min-w-0 truncate text-[11.5px] text-ink-faint">{stat.foot}</p>
        <span className="flex shrink-0 items-center gap-2">
          {spark && <MiniSpark points={spark} />}
          <TrendChip value={stat.trend} />
        </span>
      </div>
    </Card>
  );
}

type Stats = (typeof statListPrototype)[number];
declare const statListPrototype: {
  label: string;
  value: number;
  icon: typeof Users;
  tone: "ember" | "moss" | "lagoon" | "plum";
  foot: string;
  trend: number;
}[];

const TONE_BG = {
  ember: "bg-ember-soft",
  moss: "bg-moss-soft",
  lagoon: "bg-lagoon-soft",
  plum: "bg-plum-soft",
  saffron: "bg-saffron-soft",
};
const TONE_TEXT = {
  ember: "text-ember-deep",
  moss: "text-moss",
  lagoon: "text-lagoon",
  plum: "text-plum",
  saffron: "text-saffron",
};

function TrendChip({ value }: { value: number }) {
  const { t } = useI18n();
  if (value === 0)
    return (
      <span className="num inline-flex items-center gap-1 rounded-full bg-canvas-deep px-2 py-0.5 text-[11px] font-medium text-ink-mute">
        {t("持平")}
      </span>
    );
  const up = value > 0;
  return (
    <span
      className={cn(
        "num inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        up ? "bg-moss-soft text-moss" : "bg-clay-soft text-clay",
      )}
    >
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(value)}%
    </span>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${Math.max(0, min)}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-12 w-72" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[148px]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Skeleton className="h-[320px] xl:col-span-2" />
        <Skeleton className="h-[320px]" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Skeleton className="h-[300px]" />
        <Skeleton className="h-[300px] xl:col-span-2" />
      </div>
    </div>
  );
}
