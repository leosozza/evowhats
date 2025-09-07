export const API_CONFIG = {
  mode: (import.meta.env.VITE_API_MODE as "mock" | "real") ?? "real",
  baseUrl: import.meta.env.VITE_FUNCTIONS_BASE_URL || "https://your-project.functions.supabase.co/functions/v1",
  bearer: undefined,
} as const;