/**
 * Audit the food log for estimates worth a second look.
 *
 *   pnpm audit:meals -- --db ./data/drillbook.db
 *   pnpm audit:meals -- --url https://drillbook.tors-bored.com --cookie /path/to/cookie.jar --from 2026-08-27
 *
 * Flags: no itemization (pre-itemizer meals), items the USDA lookup didn't
 * ground, implausible energy density, and days that total suspiciously low
 * or high. Read-only; fixes go through PATCH /api/meals {id, detail}.
 */
import { readFileSync } from "node:fs";
import { MAX_KCAL_PER_GRAM, MIN_KCAL_PER_GRAM } from "../src/lib/foodai";

type Item = { food: string; grams: number; kcal: number; protein: number | null; source?: string };
type Meal = { id: number; date: string; name: string; calories: number; protein: number | null; method: string; itemsJson: string | null; description?: string | null };

const args = Object.fromEntries(
  process.argv.slice(2).reduce<string[][]>((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : "true"]);
    return acc;
  }, []),
);
const DAY_LOW = Number(args.low ?? 1200);
const DAY_HIGH = Number(args.high ?? 4500);

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function loadMeals(): Promise<Meal[]> {
  if (args.db) {
    const Database = (await import("better-sqlite3")).default;
    const db = new Database(args.db, { readonly: true });
    return db
      .prepare("select id, date, name, calories, protein, method, items_json as itemsJson, description from meals order by date, id")
      .all() as Meal[];
  }
  if (!args.url || !args.cookie) throw new Error("need --db <path> or --url <base> --cookie <jar>");
  // curl-style cookie jar → Cookie header
  const jar = readFileSync(args.cookie, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("\t"))
    .filter((c) => c.length >= 7)
    .map((c) => `${c[5]}=${c[6]}`)
    .join("; ");
  const to = args.to ?? new Date().toISOString().slice(0, 10);
  let date = args.from ?? addDays(to, -30);
  const out: Meal[] = [];
  while (date <= to) {
    const res = await fetch(`${args.url}/api/meals?date=${date}`, { headers: { Cookie: jar } });
    if (!res.ok) throw new Error(`${date}: ${res.status}`);
    const data = (await res.json()) as { meals: Meal[] };
    out.push(...data.meals);
    date = addDays(date, 1);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}

function items(m: Meal): Item[] {
  try {
    return m.itemsJson ? (JSON.parse(m.itemsJson) as Item[]) : [];
  } catch {
    return [];
  }
}

export type Flag = { mealId: number; date: string; name: string; calories: number; reason: string };

export function auditMeals(meals: Meal[]): { flags: Flag[]; days: { date: string; calories: number; meals: number }[] } {
  const flags: Flag[] = [];
  const byDay = new Map<string, { calories: number; meals: number }>();
  for (const m of meals) {
    const d = byDay.get(m.date) ?? { calories: 0, meals: 0 };
    d.calories += m.calories;
    d.meals += 1;
    byDay.set(m.date, d);
    const its = items(m);
    const base = { mealId: m.id, date: m.date, name: m.name, calories: Math.round(m.calories) };
    if (its.length === 0) {
      flags.push({ ...base, reason: "no itemization — single-shot estimate, ungrounded" });
      continue;
    }
    const ungrounded = its.filter((i) => i.source !== "fdc");
    if (ungrounded.length === its.length) flags.push({ ...base, reason: `0/${its.length} items grounded (FDC rate limit?)` });
    for (const i of its) {
      const dens = i.grams > 0 ? i.kcal / i.grams : Infinity;
      if (dens > MAX_KCAL_PER_GRAM || dens < MIN_KCAL_PER_GRAM) {
        flags.push({ ...base, reason: `"${i.food}" ${Math.round(i.kcal)} kcal / ${i.grams} g = ${dens.toFixed(2)} kcal/g` });
      }
    }
    const sum = its.reduce((s, i) => s + i.kcal, 0);
    if (m.calories > 0 && Math.abs(sum - m.calories) / m.calories > 0.3) {
      flags.push({ ...base, reason: `items sum ${Math.round(sum)} ≠ stored ${Math.round(m.calories)}` });
    }
  }
  const days = [...byDay.entries()].map(([date, d]) => ({ date, calories: Math.round(d.calories), meals: d.meals }));
  for (const d of days) {
    if (d.calories < DAY_LOW) flags.push({ mealId: 0, date: d.date, name: "(day)", calories: d.calories, reason: `day total under ${DAY_LOW} (${d.meals} meals) — missed meals?` });
    if (d.calories > DAY_HIGH) flags.push({ mealId: 0, date: d.date, name: "(day)", calories: d.calories, reason: `day total over ${DAY_HIGH}` });
  }
  return { flags, days };
}

if (process.argv[1]?.endsWith("audit-meals.ts")) {
  loadMeals().then((meals) => {
    const { flags, days } = auditMeals(meals);
    console.log(`${meals.length} meals over ${days.length} days\n`);
    for (const d of days) console.log(`${d.date}  ${String(d.calories).padStart(5)} kcal  ${d.meals} meals`);
    console.log(`\n${flags.length} flags`);
    for (const f of flags) console.log(`- #${f.mealId} ${f.date} ${f.name} (${f.calories}): ${f.reason}`);
  });
}
