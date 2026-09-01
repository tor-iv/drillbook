import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { hasShortcutToken } from "@/lib/auth";
import { askClaudeJson } from "@/lib/claude";
import { localDate } from "@/lib/dates";
import { workoutModel } from "@/lib/workoutai";

const workoutSchema = z.object({
  type: z.enum(["run", "swim", "climb", "lift", "other"]),
  durationMin: z.number().nonnegative().nullable().optional(),
  distanceMi: z.number().nonnegative().nullable().optional(),
  calories: z.number().nonnegative().nullable().optional(),
  startedAt: z.string().min(1),
});

const daySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bodyWeightLb: z.number().positive().optional().nullable(),
  workouts: z.array(workoutSchema).default([]),
});

// Health Auto Export's background REST push: {"data": {"metrics": [...],
// "workouts": [...]}}. Fields are loosely validated on purpose — the app's
// payload varies by version/settings, and unmapped shapes should degrade to
// warnings, not 400s.
const haeQty = z.object({ qty: z.number(), units: z.string().optional() }).partial();
const haeSchema = z.object({
  data: z.object({
    metrics: z
      .array(
        z.object({
          name: z.string(),
          units: z.string().optional(),
          // Point shape varies wildly by metric (sleep has no qty, HR has
          // min/avg/max) — accept anything, filter in the converter.
          data: z.array(z.record(z.string(), z.unknown())).default([]),
        }).passthrough(),
      )
      .optional(),
    workouts: z
      .array(
        z.object({
          name: z.string(),
          start: z.string(),
          duration: z.number().optional(),
          activeEnergyBurned: haeQty.optional(),
          totalEnergy: haeQty.optional(),
          distance: haeQty.optional(),
        }).passthrough(),
      )
      .optional(),
  }).passthrough(),
});

// Single-day (the nightly Shortcut), batch (the history import script), a
// raw text dump from a minimal Shortcut — the AI structures the dump so the
// phone side stays dumb and simple — or a Health Auto Export push.
const bodySchema = z.union([
  daySchema,
  z.object({ days: z.array(daySchema).max(500) }),
  z.object({ dump: z.string().min(3).max(20000) }),
  haeSchema,
]);

const DUMP_SYSTEM = `You convert raw Apple Health text (output of iOS Shortcuts "Find Workouts" / "Find Health Samples", any formatting) into JSON. Extract today's workouts and the most recent body weight if present. Map activity types: running->run, swimming->swim, climbing/bouldering->climb, strength/functional training->lift, anything else->other. Convert kg to lb (x2.2046) and km to miles (x0.6214). Only report numbers present in the text — use null otherwise. Reply with ONLY JSON: {"bodyWeightLb": <number|null>, "workouts": [{"type":"run|swim|climb|lift|other","durationMin":<number|null>,"distanceMi":<number|null>,"calories":<number|null>,"startedAt":"<ISO timestamp or null>"}]}`;

const dumpResultSchema = z.object({
  bodyWeightLb: z.number().positive().nullable().catch(null),
  workouts: z
    .array(
      z.object({
        type: z.enum(["run", "swim", "climb", "lift", "other"]),
        durationMin: z.number().nonnegative().nullable().catch(null),
        distanceMi: z.number().nonnegative().nullable().catch(null),
        calories: z.number().nonnegative().nullable().catch(null),
        startedAt: z.string().nullable().catch(null),
      }),
    )
    .max(20)
    .catch([]),
});

const HAE_TYPE_MAP: [RegExp, z.infer<typeof workoutSchema>["type"]][] = [
  [/run|walk|hik/i, "run"],
  [/swim/i, "swim"],
  [/climb|boulder/i, "climb"],
  [/strength|functional|core|weight|lift/i, "lift"],
];

// HAE dates look like "2026-09-01 07:00:00 -0400".
function haeDate(s: string): Date {
  return new Date(s.replace(" ", "T").replace(/ ([+-]\d{4})$/, "$1"));
}

function toLb(qty: number, units?: string): number {
  return /kg/i.test(units ?? "") ? qty * 2.2046 : qty;
}

function toMi(qty: number, units?: string): number | null {
  const u = (units ?? "mi").toLowerCase();
  if (u.startsWith("mi")) return qty;
  if (u === "km") return qty * 0.6214;
  if (u === "m") return qty / 1609;
  console.warn("[hae] unmapped distance unit:", units);
  return null;
}

function haeToDays(payload: z.infer<typeof haeSchema>): z.infer<typeof daySchema>[] {
  // Inventory every push so we can see what HAE actually sends (metrics we
  // don't consume yet are skipped, but knowing they arrive guides what to
  // wire up next).
  const metricNames = (payload.data.metrics ?? []).map((m) => `${m.name}(${m.data.length})`);
  const workoutNames = (payload.data.workouts ?? []).map((w) => w.name);
  console.log(`[hae] push: metrics=[${metricNames.join(", ")}] workouts=[${workoutNames.join(", ")}]`);

  const days = new Map<string, z.infer<typeof daySchema>>();
  const dayFor = (date: string) => {
    let d = days.get(date);
    if (!d) {
      d = { date, workouts: [] };
      days.set(date, d);
    }
    return d;
  };
  // HAE timestamps carry the phone's own offset, so the date embedded in the
  // string IS the local day — slice it, don't round-trip through Date.

  for (const metric of payload.data.metrics ?? []) {
    if (!/body_?mass|^weight/i.test(metric.name) || /lean|index/i.test(metric.name)) continue;
    for (const point of metric.data) {
      if (typeof point.date !== "string" || typeof point.qty !== "number") continue;
      const date = point.date.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      dayFor(date).bodyWeightLb = toLb(point.qty, metric.units);
    }
  }

  for (const w of payload.data.workouts ?? []) {
    const type = HAE_TYPE_MAP.find(([re]) => re.test(w.name))?.[1];
    if (!type) console.warn("[hae] unmapped workout type:", w.name);
    const date = w.start.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const energy = w.activeEnergyBurned?.qty ?? w.totalEnergy?.qty ?? null;
    dayFor(date).workouts.push({
      type: type ?? "other",
      durationMin: w.duration != null ? Math.round(w.duration / 60) : null,
      distanceMi: w.distance?.qty != null ? toMi(w.distance.qty, w.distance.units) : null,
      calories: energy,
      startedAt: haeDate(w.start).toISOString(),
    });
  }
  return [...days.values()];
}

type DayMetricAgg = Partial<Record<"activeEnergy" | "basalEnergy" | "steps" | "exerciseMin" | "distanceMi" | "sleepHours" | "restingHr" | "hrv" | "vo2Max", number>>;

// column → [name matcher, aggregation]. AVG entries accumulate {sum, n}.
const METRIC_RULES: [keyof DayMetricAgg, RegExp, "sum" | "avg" | "last"][] = [
  ["activeEnergy", /^active_energy$/, "sum"],
  ["basalEnergy", /^basal_energy/, "sum"],
  ["steps", /^step_count$/, "sum"],
  ["exerciseMin", /^apple_exercise_time$/, "sum"],
  ["distanceMi", /^walking_running_distance$/, "sum"],
  ["sleepHours", /^sleep_analysis$/, "sum"],
  ["restingHr", /^resting_heart_rate$/, "avg"],
  ["hrv", /^heart_rate_variability$/, "avg"],
  ["vo2Max", /^vo2_?max$/i, "last"],
];

function haeDayMetrics(payload: z.infer<typeof haeSchema>): Map<string, DayMetricAgg> {
  const days = new Map<string, DayMetricAgg>();
  const counts = new Map<string, number>(); // `${date}:${key}` → n, for avg

  for (const metric of payload.data.metrics ?? []) {
    const rule = METRIC_RULES.find(([, re]) => re.test(metric.name));
    if (!rule) continue;
    const [key, , agg] = rule;
    const kj = /kj/i.test(metric.units ?? "");
    for (const point of metric.data) {
      if (typeof point.date !== "string") continue;
      const date = point.date.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      // sleep_analysis points often carry hours in `asleep` instead of `qty`.
      let qty = typeof point.qty === "number" ? point.qty : undefined;
      if (key === "sleepHours" && typeof point.asleep === "number") qty = point.asleep;
      if (qty == null) continue;
      if (kj) qty /= 4.184;
      if (key === "distanceMi") qty = toMi(qty, metric.units) ?? 0;

      const day = days.get(date) ?? {};
      if (agg === "sum") day[key] = (day[key] ?? 0) + qty;
      else if (agg === "last") day[key] = qty;
      else {
        const ck = `${date}:${key}`;
        const n = (counts.get(ck) ?? 0) + 1;
        counts.set(ck, n);
        day[key] = ((day[key] ?? 0) * (n - 1) + qty) / n;
      }
      days.set(date, day);
    }
  }
  return days;
}

function upsertDay(day: z.infer<typeof daySchema>): { workouts: number; weight: boolean } {
  let wroteWeight = false;
  if (day.bodyWeightLb != null) {
    const bw = db
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.key, "bodyweight"))
      .get();
    if (bw) {
      db.insert(schema.entries)
        .values({ activityId: bw.id, date: day.date, value: day.bodyWeightLb })
        .onConflictDoUpdate({
          target: [schema.entries.activityId, schema.entries.date],
          set: { value: day.bodyWeightLb, updatedAt: sql`(datetime('now'))` },
        })
        .run();
      wroteWeight = true;
    }
  }

  for (const w of day.workouts) {
    // UNIQUE(started_at, type) → re-syncing the same day is a no-op update,
    // so the nightly Shortcut and the history import can safely overlap.
    db.insert(schema.workouts)
      .values({
        date: day.date,
        type: w.type,
        durationMin: w.durationMin ?? null,
        distanceMi: w.distanceMi ?? null,
        calories: w.calories ?? null,
        startedAt: w.startedAt,
        rawJson: JSON.stringify(w),
      })
      .onConflictDoUpdate({
        target: [schema.workouts.startedAt, schema.workouts.type],
        set: {
          durationMin: w.durationMin ?? null,
          distanceMi: w.distanceMi ?? null,
          calories: w.calories ?? null,
        },
      })
      .run();
  }
  return { workouts: day.workouts.length, weight: wroteWeight };
}

export async function POST(req: NextRequest) {
  if (!hasShortcutToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    console.warn("[health-sync] rejected payload:", parsed.error.message.slice(0, 500));
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  let payload = parsed.data;
  let metricDays: Map<string, DayMetricAgg> | null = null;
  if ("data" in payload) {
    metricDays = haeDayMetrics(payload);
    const days = haeToDays(payload);
    payload = { days };
  } else if ("dump" in payload) {
    const today = localDate();
    const ai = dumpResultSchema.parse(
      await askClaudeJson({ model: workoutModel(), system: DUMP_SYSTEM, content: payload.dump }),
    );
    payload = {
      date: today,
      bodyWeightLb: ai.bodyWeightLb,
      workouts: ai.workouts.map((w, i) => ({
        ...w,
        // Synthetic-but-stable startedAt when the dump lacks timestamps.
        startedAt: w.startedAt ?? `${today}Tdump-${i}`,
      })),
    };
  }

  const days = "days" in payload ? payload.days : [payload];
  let workoutCount = 0;
  let weightCount = 0;
  // One transaction per request: a 500-day import batch is a single fsync,
  // not 500.
  db.transaction(() => {
    for (const day of days) {
      const r = upsertDay(day);
      workoutCount += r.workouts;
      if (r.weight) weightCount++;
    }
    for (const [date, m] of metricDays ?? []) {
      db.insert(schema.dayMetrics)
        .values({ date, ...m })
        .onConflictDoUpdate({
          target: schema.dayMetrics.date,
          // Only overwrite columns this push actually carried.
          set: { ...m, updatedAt: sql`(datetime('now'))` },
        })
        .run();
    }
  });

  return NextResponse.json({
    ok: true,
    days: days.length,
    workouts: workoutCount,
    weightDays: weightCount,
    metricDays: metricDays?.size ?? 0,
  });
}
