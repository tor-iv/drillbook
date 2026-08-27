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
