import { describe, expect, it } from "vitest";
import { plausibleDensity } from "../foodai";

describe("plausibleDensity", () => {
  it("accepts normal foods", () => {
    expect(plausibleDensity({ grams: 200, kcal: 260 })).toBe(true); // rice
    expect(plausibleDensity({ grams: 14, kcal: 120 })).toBe(true); // oil
  });
  it("rejects unit slips", () => {
    expect(plausibleDensity({ grams: 100, kcal: 1500 })).toBe(false); // kJ or per-serving confusion
    expect(plausibleDensity({ grams: 300, kcal: 3 })).toBe(false);
    expect(plausibleDensity({ grams: 0, kcal: 100 })).toBe(false);
  });
});
