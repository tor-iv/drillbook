import { describe, expect, it } from "vitest";
import { toTranscript } from "../history";

describe("toTranscript", () => {
  it("re-serializes assistant rows as the router's JSON envelope", () => {
    const t = toTranscript([
      { role: "user", content: "log 20 pushups", actionsJson: null },
      {
        role: "assistant",
        content: "Logged.",
        actionsJson: JSON.stringify([{ type: "counter", activityKey: "pushups", delta: 20 }]),
      },
    ]);
    expect(t).toEqual([
      { role: "user", content: "log 20 pushups" },
      {
        role: "assistant",
        content: JSON.stringify({ reply: "Logged.", actions: [{ type: "counter", activityKey: "pushups", delta: 20 }] }),
      },
    ]);
  });

  it("drops leading assistant rows so the transcript opens with a user turn", () => {
    const t = toTranscript([
      { role: "assistant", content: "orphan", actionsJson: null },
      { role: "user", content: "hi", actionsJson: null },
    ]);
    expect(t.map((m) => m.role)).toEqual(["user"]);
  });

  it("tolerates corrupt actions json", () => {
    const t = toTranscript([
      { role: "user", content: "x", actionsJson: null },
      { role: "assistant", content: "y", actionsJson: "{not json" },
    ]);
    expect(t[1].content).toBe(JSON.stringify({ reply: "y", actions: [] }));
  });
});
