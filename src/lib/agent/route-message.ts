import { askClaudeJsonMessages } from "@/lib/claude";
import { coachModel } from "@/lib/coach";
import { runAction } from "./actions";
import { buildRouterContext } from "./context";
import { loadHistory, persistTurn, type Channel } from "./history";
import { ROUTER_SYSTEM } from "./prompt";
import { routerSchema, type Action } from "./schema";

export type { Channel };

export type RoutedReply = {
  reply: string;
  actions: Action[];
  results: string[];
  /** reply + receipts, the exact text Telegram has always sent. */
  text: string;
};

/**
 * The one conversational entry point. Every channel hands a text message in
 * and gets the coach's reply plus the receipts of whatever it logged. Prior
 * turns (from any channel) ride along, so follow-ups resolve; only the current
 * turn carries the full live-numbers context.
 */
export async function routeMessage(
  message: string,
  opts: { channel: Channel; clientMsgId?: string },
): Promise<RoutedReply> {
  const routed = routerSchema.parse(
    await askClaudeJsonMessages({
      model: coachModel(),
      system: ROUTER_SYSTEM,
      messages: [...loadHistory(), { role: "user", content: JSON.stringify(await buildRouterContext(message)) }],
    }),
  );
  const results: string[] = [];
  for (const a of routed.actions) {
    results.push(await runAction(a).catch((e) => `(failed: ${String(e).slice(0, 60)})`));
  }
  persistTurn({
    channel: opts.channel,
    userContent: message,
    reply: routed.reply,
    actions: routed.actions,
    results,
    clientMsgId: opts.clientMsgId,
  });
  const text = results.length ? `${routed.reply}\n${results.join("\n")}` : routed.reply;
  return { reply: routed.reply, actions: routed.actions, results, text };
}
