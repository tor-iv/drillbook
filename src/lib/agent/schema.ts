import { z } from "zod";

// The action vocabulary the router model can emit alongside its reply. Every
// channel (Telegram, web chat) parses the model's JSON with this one schema,
// so adding an ability = add a variant here + a branch in actions.ts + a line
// in prompt.ts.
export const actionSchema = z.union([
  z.object({ type: z.literal("counter"), activityKey: z.string(), delta: z.number() }),
  z.object({ type: z.literal("weight"), value: z.number().positive() }),
  z.object({ type: z.literal("meal"), description: z.string().min(1) }),
  z.object({ type: z.literal("workout"), description: z.string().min(1) }),
  z.object({
    type: z.literal("calendar"),
    title: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
  }),
  z.object({
    type: z.literal("todo_add"),
    text: z.string().min(1),
    due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  }),
  z.object({ type: z.literal("todo_done"), match: z.string().min(1) }),
  z.object({ type: z.literal("meal_revise"), detail: z.string().min(1) }),
]);

export const routerSchema = z.object({
  reply: z.string().min(1),
  actions: z.array(actionSchema).max(6).catch([]),
});

export type Action = z.infer<typeof actionSchema>;
export type RouterOutput = z.infer<typeof routerSchema>;
