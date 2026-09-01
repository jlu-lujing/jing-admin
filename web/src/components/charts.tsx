import { useId, useRef, useState } from "react";
import { cn } from "../lib/utils";

/* 跟随语义 token，明暗与主题色自动联动 */
const PALETTE = ["var(--c-ember)", "var(--c-plum)", "var(--c-moss)", "var(--c-saffron)", "var(--c-clay)", "var(--c-ink-faint)"];

function niceStep(raw: number) {
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

/* ---------- interactive area line chart ---------- */
export function AreaChart({
  data,
  height = 250,
  color = "var(--c-ember)",
  formatValue = (v: number) => String(v),
}: {
  data: { date: string; value: number }[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
}) {
  const id = useId().replace(/:/g, "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const w = 720;
  const h = height;
  const padX = 40;
  const padTop = 20;
  const padBottom = 30;
  const rawMax = Math.max(...data.map((d) => d.value), 1);
  const step = niceStep((rawMax * 1.15) / 4);
  const max = step * 4;

  const pts = data.map((d, i) => {
    const x = padX + (i * (w - padX * 2)) / Math.max(1, data.length - 1);
    const y = padTop + (1 - d.value / max) * (h - padTop - padBottom);
    return { x, y, ...d };
  });

  // catmull-rom → cubic bezier smoothing
  let line = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    line += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  const area = `${line} L${pts[pts.length - 1].x},${h - padBottom} L${pts[0].x},${h - padBottom} Z`;

  const labelSkip = Math.ceil(data.length / 8);

  function onMove(e: React.MouseEvent) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const fx = ((e.clientX - rect.left) / rect.width) * w;
    const t = ((fx - padX) / (w - padX * 2)) * (data.length - 1);
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(t))));
  }

  const hp = hover !== null ? pts[hover] : null;
  const flip = hp ? hp.x > w * 0.72 : false;

  return (
    <div ref={wrapRef} className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.2 }} />
            <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        {Array.from({ length: 5 }).map((_, i) => {
          const y = padTop + (i * (h - padTop - padBottom)) / 4;
          const val = Math.round(max - i * step);
          return (
            <g key={i}>
              <line x1={padX} y1={y} x2={w - padX} y2={y} stroke="var(--c-line)" strokeDasharray={i === 4 ? undefined : "2 5"} strokeWidth={1} />
              <text x={padX - 8} y={y + 3} textAnchor="end" fontSize="10" fill="var(--c-ink-faint)" fontFamily="var(--font-mono)">
                {val}
              </text>
            </g>
          );
        })}
        {pts.map((p, i) =>
          i % labelSkip === 0 || i === pts.length - 1 ? (
            <text key={`t${i}`} x={p.x} y={h - 8} textAnchor="middle" fontSize="10.5" fill="var(--c-ink-mute)" fontFamily="var(--font-mono)">
              {p.date}
            </text>
          ) : null,
        )}
        <path d={area} fill={`url(#fill-${id})`} className="anim-fade" />
        <path
          d={line}
          fill="none"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="chart-line"
          style={{ ["--dash" as string]: "2400", stroke: color }}
        />
        {/* today marker */}
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="7" style={{ fill: color }} opacity="0.15" className="anim-pulse" />
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="3.2" style={{ fill: "var(--c-surface)", stroke: color }} strokeWidth="2" />

        {/* crosshair */}
        {hp && (
          <g>
            <line x1={hp.x} y1={padTop - 6} x2={hp.x} y2={h - padBottom} style={{ stroke: color }} strokeWidth="1" strokeDasharray="3 3" opacity="0.45" />
            <circle cx={hp.x} cy={hp.y} r="9" style={{ fill: color }} opacity="0.14" />
            <circle cx={hp.x} cy={hp.y} r="4" style={{ fill: color, stroke: "var(--c-surface)" }} strokeWidth="2" />
          </g>
        )}
      </svg>

      {hp && (
        <div
          className="pointer-events-none absolute top-1 z-10 anim-fade"
          style={{
            left: `${(hp.x / w) * 100}%`,
            transform: flip ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
          }}
        >
          <div className="rounded-[10px] border border-line bg-surface px-3 py-2 shadow-pop">
            <p className="num text-[10.5px] tracking-wide text-ink-mute">{hp.date}</p>
            <p className="num mt-0.5 text-[15px] font-bold text-ink">
              {formatValue(hp.value)}
              <span className="ml-1 text-[10.5px] font-medium text-ink-mute">{hp.value === 1 ? "request" : "requests"}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- donut with hover sync ---------- */
export function DonutChart({
  data,
  size = 168,
  thickness = 22,
  totalLabel = "Total",
}: {
  data: { name: string; value: number }[];
  size?: number;
  thickness?: number;
  totalLabel?: string;
}) {
  const [hi, setHi] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness - 6) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: "var(--c-canvas-deep)" }} strokeWidth={thickness} />
          {data.map((d, i) => {
            const frac = d.value / total;
            const dash = frac * c;
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                strokeWidth={hi === i ? thickness + 5 : thickness}
                strokeDasharray={`${Math.max(dash - 2, 0.8)} ${c - dash + 2}`}
                strokeDashoffset={-acc}
                strokeLinecap="round"
                style={{
                  stroke: PALETTE[i % PALETTE.length],
                  transition: "stroke-width .18s ease, opacity .18s ease",
                  opacity: hi === null || hi === i ? 1 : 0.3,
                }}
                onMouseEnter={() => setHi(i)}
                onMouseLeave={() => setHi(null)}
              />
            );
            acc += dash;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {hi !== null ? (
            <>
              <span className="num text-[20px] leading-none font-bold" style={{ color: PALETTE[hi % PALETTE.length] }}>
                {Math.round((data[hi].value / total) * 100)}%
              </span>
              <span className="mt-1.5 max-w-[90px] truncate text-[11px] font-medium text-ink-mute">{data[hi].name}</span>
            </>
          ) : (
            <>
              <span className="num text-[22px] leading-none font-bold text-ink">{total.toLocaleString()}</span>
              <span className="mt-1 text-[10px] font-medium tracking-[0.14em] text-ink-faint uppercase">{totalLabel}</span>
            </>
          )}
        </div>
      </div>
      <ul className="flex-1 space-y-1">
        {data.map((d, i) => (
          <li
            key={i}
            onMouseEnter={() => setHi(i)}
            onMouseLeave={() => setHi(null)}
            className={cn(
              "flex cursor-default items-center gap-2.5 rounded-lg px-2 py-1 text-[12.5px] transition",
              hi === i && "bg-canvas-deep/70",
            )}
          >
            <span className="h-2.5 w-2.5 rounded-[3px] transition-transform" style={{ background: PALETTE[i % PALETTE.length], transform: hi === i ? "scale(1.3)" : undefined }} />
            <span className="flex-1 truncate text-ink-soft">{d.name}</span>
            <span className="num font-semibold text-ink">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- hover horizontal bars ---------- */
export function HBars({
  data,
  unit = "",
}: {
  data: { name: string; value: number }[];
  unit?: string;
}) {
  const [hi, setHi] = useState<number | null>(null);
  const total = data.reduce((s, v) => s + v.value, 0) || 1;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="space-y-1">
      {data.map((d, i) => (
        <li
          key={i}
          onMouseEnter={() => setHi(i)}
          onMouseLeave={() => setHi(null)}
          className={cn("rounded-lg px-2 py-1.5 transition-colors", hi === i && "bg-canvas-deep/60")}
        >
          <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
            <span className="flex items-center gap-2">
              <span
                className="num flex h-[18px] w-[18px] items-center justify-center rounded-[5px] text-[10px] font-bold transition-colors"
                style={{
                  background: hi === i ? PALETTE[i % PALETTE.length] : "var(--c-canvas-deep)",
                  color: hi === i ? "#fff" : "var(--c-ink-mute)",
                }}
              >
                {i + 1}
              </span>
              <span className="font-medium text-ink-soft">{d.name}</span>
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="num font-semibold text-ink">
                {d.value}
                {unit}
              </span>
              <span className="num text-[10.5px] text-ink-faint">{Math.round((d.value / total) * 100)}%</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-canvas-deep">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${(d.value / max) * 100}%`,
                background: `linear-gradient(90deg, ${PALETTE[i % PALETTE.length]}, ${PALETTE[i % PALETTE.length]}aa)`,
                filter: hi !== null && hi !== i ? "saturate(0.4)" : undefined,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
