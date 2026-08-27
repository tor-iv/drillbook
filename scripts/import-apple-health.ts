/**
 * One-time Apple Health history import.
 *
 * Usage:
 *   pnpm import:health -- --zip ~/Library/Mobile\ Documents/com~apple~CloudDocs/export.zip \
 *     --url https://drillbook.tors-bored.com --token $SHORTCUT_API_TOKEN [--dry-run]
 *
 * Streams export.xml (multi-GB) with sax, extracts daily body weight
 * (HKQuantityTypeIdentifierBodyMass) and workouts, then POSTs batches to
 * /api/health-sync. Idempotent server-side — safe to re-run.
 */
import { spawn } from "node:child_process";
import sax from "sax";

type Workout = {
  type: "run" | "swim" | "climb" | "lift" | "other";
  durationMin: number | null;
  distanceMi: number | null;
  calories: number | null;
  startedAt: string;
};
type Day = { date: string; bodyWeightLb?: number; workouts: Workout[] };

const args = process.argv.slice(2);
function arg(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const zipPath = arg("zip");
const baseUrl = arg("url") ?? "http://localhost:3000";
const token = arg("token") ?? process.env.SHORTCUT_API_TOKEN;
const dryRun = args.includes("--dry-run");

if (!zipPath || !token) {
  console.error("required: --zip <export.zip> --token <SHORTCUT_API_TOKEN> [--url <base>] [--dry-run]");
  process.exit(1);
}

const TYPE_MAP: Record<string, Workout["type"]> = {
  HKWorkoutActivityTypeRunning: "run",
  HKWorkoutActivityTypeSwimming: "swim",
  HKWorkoutActivityTypeClimbing: "climb",
  HKWorkoutActivityTypeRockClimbing: "climb",
  HKWorkoutActivityTypeTraditionalStrengthTraining: "lift",
  HKWorkoutActivityTypeFunctionalStrengthTraining: "lift",
};

const LB_PER_KG = 2.2046226218;

const days = new Map<string, Day>();
function dayFor(date: string): Day {
  let d = days.get(date);
  if (!d) days.set(date, (d = { date, workouts: [] }));
  return d;
}

// Apple exports dates as "2024-01-05 07:31:22 -0500" — the date prefix is
// already in the device's local time, which is what we want for "which day".
const dateOf = (s: string) => s.slice(0, 10);
const isoOf = (s: string) => s.replace(" ", "T").replace(" ", "");

let records = 0;
let workouts = 0;
// Latest weight sample per day wins (matches the nightly Shortcut behavior).
const weightSeen = new Map<string, string>();

const parser = sax.createStream(true, { trim: true });

// Workout children (WorkoutStatistics) carry distance/energy in newer exports.
let current: { start: string; type: Workout["type"]; durationMin: number | null; distanceMi: number | null; calories: number | null } | null = null;

parser.on("opentag", (node) => {
  const a = node.attributes as Record<string, string>;
  if (node.name === "Record" && a.type === "HKQuantityTypeIdentifierBodyMass") {
    records++;
    const date = dateOf(a.startDate ?? "");
    const prev = weightSeen.get(date);
    if (!date || (prev && prev > (a.startDate ?? ""))) return;
    weightSeen.set(date, a.startDate ?? "");
    const raw = parseFloat(a.value ?? "");
    if (!Number.isFinite(raw)) return;
    const lb = a.unit === "kg" ? raw * LB_PER_KG : raw;
    dayFor(date).bodyWeightLb = Math.round(lb * 10) / 10;
  } else if (node.name === "Workout") {
    workouts++;
    const dur = parseFloat(a.duration ?? "");
    const dist = parseFloat(a.totalDistance ?? "");
    const cal = parseFloat(a.totalEnergyBurned ?? "");
    current = {
      start: a.startDate ?? "",
      type: TYPE_MAP[a.workoutActivityType ?? ""] ?? "other",
      durationMin: Number.isFinite(dur) ? (a.durationUnit === "s" ? dur / 60 : dur) : null,
      distanceMi: Number.isFinite(dist) ? (a.totalDistanceUnit === "km" ? dist * 0.621371 : dist) : null,
      calories: Number.isFinite(cal) ? cal : null,
    };
  } else if (node.name === "WorkoutStatistics" && current) {
    const sum = parseFloat(a.sum ?? "");
    if (!Number.isFinite(sum)) return;
    if (a.type === "HKQuantityTypeIdentifierDistanceWalkingRunning" || a.type === "HKQuantityTypeIdentifierDistanceSwimming") {
      current.distanceMi = a.unit === "km" ? sum * 0.621371 : a.unit === "m" ? sum / 1609.34 : a.unit === "yd" ? sum / 1760 : sum;
    } else if (a.type === "HKQuantityTypeIdentifierActiveEnergyBurned") {
      current.calories = sum;
    }
  }
});

parser.on("closetag", (name) => {
  if (name === "Workout" && current) {
    const date = dateOf(current.start);
    if (date) {
      dayFor(date).workouts.push({
        type: current.type,
        durationMin: current.durationMin != null ? Math.round(current.durationMin * 10) / 10 : null,
        distanceMi: current.distanceMi != null ? Math.round(current.distanceMi * 100) / 100 : null,
        calories: current.calories != null ? Math.round(current.calories) : null,
        startedAt: isoOf(current.start),
      });
    }
    current = null;
  }
});

async function upload() {
  const all = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const withData = all.filter((d) => d.bodyWeightLb != null || d.workouts.length > 0);
  console.log(
    `parsed: ${records} weight samples, ${workouts} workouts → ${withData.length} days (${withData[0]?.date} … ${withData.at(-1)?.date})`,
  );
  if (dryRun) {
    console.log("dry run — not uploading");
    return;
  }
  const BATCH = 200;
  for (let i = 0; i < withData.length; i += BATCH) {
    const batch = withData.slice(i, i + BATCH);
    const res = await fetch(`${baseUrl}/api/health-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ days: batch }),
    });
    if (!res.ok) {
      console.error(`batch ${i / BATCH + 1} failed: ${res.status} ${await res.text()}`);
      process.exit(1);
    }
    console.log(`uploaded ${Math.min(i + BATCH, withData.length)}/${withData.length} days`);
  }
  console.log("done");
}

// unzip -p streams export.xml without extracting 2.3GB to disk.
const unzip = spawn("unzip", ["-p", zipPath!, "apple_health_export/export.xml"]);
unzip.stdout.pipe(parser);
unzip.on("error", (e) => {
  console.error("unzip failed:", e);
  process.exit(1);
});
parser.on("end", () => {
  upload().catch((e) => {
    console.error(e);
    process.exit(1);
  });
});
parser.on("error", (e) => {
  console.error("XML parse error:", e.message);
  process.exit(1);
});
