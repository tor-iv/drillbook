import { describe, expect, it } from "vitest";
import { hashToken } from "../auth";

describe("hashToken", () => {
  it("is deterministic hex sha-256 and never echoes the token", () => {
    const h = hashToken("tally_abc");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(hashToken("tally_abc"));
    expect(h).not.toContain("abc");
  });
});
