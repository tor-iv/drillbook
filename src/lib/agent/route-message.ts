import { askClaudeJson } from "@/lib/claude";
import { coachModel } from "@/lib/coach";
import { runAction } from "./actions";
import { buildRouterContext } from "./context";
import { ROUTER_SYSTEM } from "./prompt";
import { routerSchema, type Action } from "./schema";

export type Channel = "web" | "telegram";

export type RoutedReply = {
  reply: string;
  actions: Action[];
  results: string[];
  /** reply + receipts, the exact text Telegram has always sent. */
  text: string;
};

/**
 * The one conversational entry point. Every channel hands a text message in
 * and gets the coach's reply plus the receipts of whatever it logged.
 */
export async function routeMessage(message: string, opts: { channel: Channel }): Promise<RoutedReply> {
  void opts; // channel becomes meaningful once history is persisted per channel
  const routed = routerSchema.parse(
    await askClaudeJson({
      model: coachModel(),
      system: ROUTER_SYSTEM,
      content: JSON.stringify(await buildRouterContext(message)),
    }),
  );
  const results: string[] = [];
  for (const a of routed.actions) {
    results.push(await runAction(a).catch((e) => `(failed: ${String(e).slice(0, 60)})`));
  }
  const text = results.length ? `${routed.reply}\n${results.join("\n")}` : routed.reply;
  return { reply: routed.reply, actions: routed.actions, results, text };
}
