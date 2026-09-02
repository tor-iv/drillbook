import { describe, expect, it } from "vitest";
import { fuzzyFind } from "../match";
import { MAX_MEMORY_ROWS, renderMemories } from "../memories";

describe("fuzzyFind", () => {
  const items = [{ t: "call the dentist" }, { t: "buy climbing chalk" }];
  it("prefers an exact case-insensitive match", () => {
    expect(fuzzyFind(items, (i) => i.t, "Buy Climbing Chalk")?.t).toBe("buy climbing chalk");
  });
  it("falls back to containment either way", () => {
    expect(fuzzyFind(items, (i) => i.t, "dentist")?.t).toBe("call the dentist");
    expect(fuzzyFind(items, (i) => i.t, "I should buy climbing chalk today")?.t).toBe("buy climbing chalk");
  });
  it("ignores blank needles", () => {
    expect(fuzzyFind(items, (i) => i.t, "  ")).toBeUndefined();
  });
});

describe("renderMemories", () => {
  it("groups by category order and tags each line with its id", () => {
    const out = renderMemories([
      { id: 2, category: "schedule", content: "gym closed Mondays" },
      { id: 1, category: "person", content: "sister Anna, bday Oct 4" },
    ]);
    expect(out).toBe("#1 [person] sister Anna, bday Oct 4\n#2 [schedule] gym closed Mondays");
  });
  it("caps rows", () => {
    const rows = Array.from({ length: MAX_MEMORY_ROWS + 10 }, (_, i) => ({ id: i, category: "fact" as const, content: `f${i}` }));
    expect(renderMemories(rows).split("\n")).toHaveLength(MAX_MEMORY_ROWS);
  });
  it("caps characters", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: i, category: "fact" as const, content: "x".repeat(200) }));
    expect(renderMemories(rows).length).toBeLessThanOrEqual(3000);
  });
});

describe("fuzzyFind whitespace", () => {
  it("matches across differing internal whitespace", () => {
    const items = [{ t: "gym is closed   Mondays" }];
    expect(fuzzyFind(items, (i) => i.t, "closed mondays")).toBeDefined();
  });
});
