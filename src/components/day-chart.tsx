"use client";

import { useState } from "react";

export type DayPoint = { date: string; value: number | null };

const W = 440;
const H = 130;
const PAD = { top: 14, right: 34, bottom: 20, left: 8 };

function niceMax(v: number): number {
  if (v <= 10) return 10;
  const pow = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / pow) * pow;
}

/**
 * One activity, one series. Counters render as baseline-anchored bars with a
 * dashed goal reference line; measures (weight) render as a 2px line. Tap or
 * hover a day to pin its value in the caption row (touch-friendly tooltip).
 */
export function DayChart({
  points,
  goal,
  unit,
  kind,
}: {
  points: DayPoint[];
  goal: number | null;
  unit: string;
  kind: "counter" | "measure";
}) {
  const [picked, setPicked] = useState<number | null>(null);

  const values = points.map((p) => p.value).filter((v): v is number => v != null);
  if (values.length === 0) {
    return <p className="text-sm text-pencil">nothing logged in this range yet</p>;
  }

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  // Counters: zero-baseline bars, rounded-up max. Measures: tight domain
  // around the data — a 177–181lb series must not flatline on a 0–200 axis.
  const lo = kind === "measure" ? Math.floor(Math.min(...values) - 1) : 0;
  const hi =
    kind === "measure"
      ? Math.ceil(Math.max(...values) + 1)
      : niceMax(Math.max(Math.max(...values), goal ?? 0, lo + 1));
  const y = (v: number) => PAD.top + innerH - ((v - lo) / (hi - lo)) * innerH;
  const x = (i: number) => PAD.left + (i + 0.5) * (innerW / points.length);
  const barW = Math.max(2, innerW / points.length - 2); // 2px surface gap

  const lastIdx = points.reduce((last, p, i) => (p.value != null ? i : last), -1);
  const pickedPoint = picked != null ? points[picked] : null;

  const fmtDate = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <figure>
      <figcaption className="flex h-5 items-baseline gap-2 text-xs text-pencil">
        {pickedPoint ? (
          <>
            <span className="font-display text-sm text-ink">{fmtDate(pickedPoint.date)}</span>
            <span>
              {pickedPoint.value != null ? `${pickedPoint.value} ${unit}` : "not logged"}
            </span>
          </>
        ) : (
          <span>
            {fmtDate(points[0].date)} – {fmtDate(points[points.length - 1].date)}
            {goal != null && ` · goal ${goal} ${unit}/day`}
          </span>
        )}
      </figcaption>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y select-none"
        role="img"
        aria-label={`daily ${unit} chart`}
        onMouseLeave={() => setPicked(null)}
      >
        {/* recessive baseline + max gridline */}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(lo)} y2={y(lo)} stroke="var(--color-rule)" strokeWidth={1} />
        <line x1={PAD.left} x2={W - PAD.right} y1={y(hi)} y2={y(hi)} stroke="var(--color-rule)" strokeWidth={1} strokeDasharray="2 4" />
        <text x={W - PAD.right + 4} y={y(hi) + 3} fontSize={9} fill="var(--color-pencil)">
          {hi}
        </text>

        {kind === "counter" ? (
          points.map((p, i) =>
            p.value != null && p.value > 0 ? (
              <rect
                key={p.date}
                x={x(i) - barW / 2}
                y={y(p.value)}
                width={barW}
                height={Math.max(1, y(lo) - y(p.value))}
                rx={Math.min(3, barW / 2)}
                fill={goal != null && p.value >= goal ? "var(--color-ink)" : "var(--color-pencil)"}
              />
            ) : null,
          )
        ) : (
          <polyline
            points={points
              .map((p, i) => (p.value != null ? `${x(i)},${y(p.value)}` : null))
              .filter(Boolean)
              .join(" ")}
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* goal reference line, labeled at its own end */}
        {goal != null && kind === "counter" && (
          <>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(goal)}
              y2={y(goal)}
              stroke="var(--color-margin)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            <text x={W - PAD.right + 4} y={y(goal) + 3} fontSize={9} fill="var(--color-margin)">
              {goal}
            </text>
          </>
        )}

        {/* selective direct label: latest value only */}
        {lastIdx >= 0 && picked == null && (
          <text
            x={Math.min(x(lastIdx), W - PAD.right - 2)}
            y={y(points[lastIdx].value!) - 5}
            fontSize={10}
            textAnchor="end"
            fill="var(--color-ink)"
          >
            {points[lastIdx].value}
          </text>
        )}

        {/* picked-day marker + wide hit targets (full column, > mark size) */}
        {pickedPoint?.value != null && (
          <circle cx={x(picked!)} cy={y(pickedPoint.value)} r={4.5} fill="var(--color-margin)" stroke="var(--color-paper)" strokeWidth={2} />
        )}
        {points.map((p, i) => (
          <rect
            key={`hit-${p.date}`}
            x={PAD.left + i * (innerW / points.length)}
            y={0}
            width={innerW / points.length}
            height={H}
            fill="transparent"
            onMouseEnter={() => setPicked(i)}
            onClick={() => setPicked(picked === i ? null : i)}
          />
        ))}
      </svg>
    </figure>
  );
}
