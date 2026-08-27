import { db, schema } from "../src/db";

const DEFAULTS = [
  { key: "pullups", label: "Pull-ups", kind: "counter", unit: "reps", dailyTarget: 20, sortOrder: 1 },
  { key: "pushups", label: "Push-ups", kind: "counter", unit: "reps", dailyTarget: 50, sortOrder: 2 },
  { key: "squats", label: "Squats", kind: "counter", unit: "reps", dailyTarget: 50, sortOrder: 3 },
  { key: "abs", label: "Abs", kind: "counter", unit: "reps", dailyTarget: 50, sortOrder: 4 },
  { key: "pages", label: "Pages read", kind: "counter", unit: "pages", dailyTarget: 20, sortOrder: 5 },
  { key: "bodyweight", label: "Body weight", kind: "measure", unit: "lb", dailyTarget: null, sortOrder: 6 },
] as const;

// Idempotent: only inserts keys that don't exist yet, so it can run on every
// migrate without clobbering targets the user edited in /settings.
export function seedDefaultActivities() {
  for (const a of DEFAULTS) {
    db.insert(schema.activities)
      .values({ ...a, dailyTarget: a.dailyTarget })
      .onConflictDoNothing({ target: schema.activities.key })
      .run();
  }
}

if (process.argv[1]?.endsWith("seed-activities.ts")) {
  seedDefaultActivities();
  console.log("default activities seeded");
}
