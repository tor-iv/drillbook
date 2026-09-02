// Client-safe (no DB import) — shared by the brain editor and the server module.
export const MEMORY_CATEGORIES = ["person", "schedule", "preference", "goal", "fact", "health"] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];
export type MemorySource = "chat" | "manual";
export type Memory = {
  id: number;
  category: MemoryCategory;
  content: string;
  source: MemorySource;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};
