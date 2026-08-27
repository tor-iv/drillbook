import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Generic activity model: adding a new thing to track is a row, not a migration.
// kind = 'counter'  → summed through the day (reps, pages); quick-add increments
// kind = 'measure'  → one value per day (body weight); quick-set overwrites
export const activities = sqliteTable("activities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  kind: text("kind", { enum: ["counter", "measure"] }).notNull(),
  unit: text("unit").notNull(),
  dailyTarget: real("daily_target"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const entries = sqliteTable(
  "entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    activityId: integer("activity_id")
      .notNull()
      .references(() => activities.id),
    date: text("date").notNull(), // 'YYYY-MM-DD' in the user's local day
    value: real("value").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex("entries_activity_date_idx").on(t.activityId, t.date)],
);

// Workouts synced from Apple Health (Shortcut or history import) — kept apart
// from entries because they carry structure (duration/distance) and feed the
// weekly coach, not the daily goals.
export const workouts = sqliteTable(
  "workouts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    type: text("type", { enum: ["run", "swim", "climb", "lift", "other"] }).notNull(),
    durationMin: real("duration_min"),
    distanceMi: real("distance_mi"),
    calories: real("calories"),
    startedAt: text("started_at"), // HealthKit start timestamp — idempotency key
    source: text("source").notNull().default("apple_health"),
    rawJson: text("raw_json"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex("workouts_started_type_idx").on(t.startedAt, t.type)],
);

export const photos = sqliteTable("photos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  takenAt: text("taken_at").notNull(), // 'YYYY-MM-DD'
  filePath: text("file_path").notNull(), // relative to UPLOAD_DIR
  caption: text("caption"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// Food log: one row per meal/snack, calories guesstimated by a vision/text
// model from a photo or a quick (often dictated) description.
export const meals = sqliteTable("meals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // 'YYYY-MM-DD'
  name: text("name").notNull(), // short label the model extracts ("chicken burrito")
  description: text("description"), // what the user typed/said, null for photo-only
  calories: real("calories").notNull(),
  protein: real("protein"),
  method: text("method", { enum: ["photo", "text"] }).notNull(),
  photoPath: text("photo_path"), // under UPLOAD_DIR/meals, null for text entries
  model: text("model").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const aiNudges = sqliteTable("ai_nudges", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  kind: text("kind", { enum: ["daily", "weekly"] }).notNull(),
  content: text("content").notNull(),
  model: text("model").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// Single row (id = 1): the one refresh token for the one user.
export const googleTokens = sqliteTable("google_tokens", {
  id: integer("id").primaryKey(),
  refreshToken: text("refresh_token").notNull(),
  connectedAt: text("connected_at").notNull(),
  calendarId: text("calendar_id").notNull().default("primary"),
});

// "Did this job already run today?" — survives container restarts, which an
// in-process scheduler alone would not.
export const cronRuns = sqliteTable("cron_runs", {
  jobKey: text("job_key").primaryKey(),
  lastRunDate: text("last_run_date").notNull(),
});
