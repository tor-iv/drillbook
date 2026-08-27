import Anthropic from "@anthropic-ai/sdk";

// One Anthropic client for everything AI in Drillbook: coach text (nudges,
// weekly plans) and food-photo estimates. Single provider, single key.
let _client: Anthropic | null = null;

export function claudeClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "no-key" });
  }
  return _client;
}

export function claudeConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return !!key && key.trim() !== "" && !key.includes("placeholder");
}

/**
 * The one place model calls happen — every model quirk lives here, not in
 * callers (the Sonnet adaptive-thinking budget bug had to be fixed twice
 * because this helper didn't exist):
 * - Sonnet/Opus think adaptively by default → budget must cover thinking,
 *   and low effort keeps simple tasks cheap. Haiku 4.5 rejects the effort
 *   param, so it's only sent to models that support it.
 * - refusal and max_tokens stop reasons become distinct, readable errors.
 * - usage is logged so cost drift is visible in `docker compose logs`.
 */
export async function askClaude(opts: {
  model: string;
  system: string;
  content: string | Anthropic.ContentBlockParam[];
  maxTokens?: number;
}): Promise<string> {
  const response = await claudeClient().messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 1500,
    ...(opts.model.includes("haiku") ? {} : { output_config: { effort: "low" as const } }),
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
  });

  console.log(
    `[claude] ${opts.model} in=${response.usage.input_tokens} out=${response.usage.output_tokens} stop=${response.stop_reason}`,
  );
  if (response.stop_reason === "refusal") throw new Error("model declined the request");
  if (response.stop_reason === "max_tokens") throw new Error("response truncated (max_tokens hit)");
  const text = response.content.find((b) => b.type === "text")?.text.trim();
  if (!text) throw new Error("empty model response");
  return text;
}

/** askClaude + tolerant JSON extraction (strips stray prose/code fences). */
export async function askClaudeJson(opts: Parameters<typeof askClaude>[0]): Promise<unknown> {
  const text = await askClaude(opts);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`no JSON in response: ${text.slice(0, 120)}`);
  return JSON.parse(match[0]);
}
