// USDA FoodData Central grounding for meal estimates. The model names foods
// and gram amounts; FDC supplies per-100g calories/protein so totals come
// from a database, not the model's numeric intuition. Free API — DEMO_KEY
// works rate-limited (30/hr); set FDC_API_KEY (fdc.nal.usda.gov signup) for
// real limits.

const SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
const TIMEOUT_MS = 2500;

type FdcNutrient = { nutrientId?: number; nutrientName?: string; unitName?: string; value?: number };
type FdcFood = { description?: string; foodNutrients?: FdcNutrient[] };

export type GroundedItem = {
  food: string;
  grams: number;
  kcal: number;
  protein: number | null;
  source: "fdc" | "model";
  fdcMatch?: string;
};

function nutrient(food: FdcFood, ids: number[], name: RegExp): number | null {
  const hit = food.foodNutrients?.find(
    (n) => (n.nutrientId != null && ids.includes(n.nutrientId)) || (n.nutrientName != null && name.test(n.nutrientName)),
  );
  return hit?.value ?? null;
}

async function searchFood(query: string): Promise<FdcFood | null> {
  const key = process.env.FDC_API_KEY ?? "DEMO_KEY";
  const params = new URLSearchParams({
    api_key: key,
    query,
    dataType: "Survey (FNDDS),SR Legacy",
    pageSize: "1",
  });
  const res = await fetch(`${SEARCH_URL}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    console.warn("[fdc] search failed:", res.status);
    return null;
  }
  const data = (await res.json()) as { foods?: FdcFood[] };
  return data.foods?.[0] ?? null;
}

/**
 * Ground one model-estimated item against FDC. Keeps the model's number when
 * the lookup fails or disagrees wildly (>60% kcal deviation usually means a
 * bad match, and a bad match is worse than the model's own guess).
 */
export async function groundItem(item: { food: string; grams: number; kcal: number; protein: number | null }): Promise<GroundedItem> {
  try {
    const match = await searchFood(item.food);
    if (!match) return { ...item, source: "model" };
    // Energy: nutrientId 1008 (kcal); protein: 1003.
    const kcalPer100 = nutrient(match, [1008], /^energy$/i);
    const proteinPer100 = nutrient(match, [1003], /^protein$/i);
    if (kcalPer100 == null || kcalPer100 <= 0) return { ...item, source: "model" };
    const kcal = (kcalPer100 * item.grams) / 100;
    const deviation = item.kcal > 0 ? Math.abs(kcal - item.kcal) / item.kcal : 0;
    if (deviation > 0.6) {
      console.warn(`[fdc] mismatch for "${item.food}" (model ${Math.round(item.kcal)}, fdc ${Math.round(kcal)} via "${match.description}") — keeping model`);
      return { ...item, source: "model" };
    }
    return {
      food: item.food,
      grams: item.grams,
      kcal,
      protein: proteinPer100 != null ? (proteinPer100 * item.grams) / 100 : item.protein,
      source: "fdc",
      fdcMatch: match.description,
    };
  } catch (e) {
    console.warn("[fdc] lookup error:", String(e).slice(0, 120));
    return { ...item, source: "model" };
  }
}
