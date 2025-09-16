const trim = (s?: string) => (s || "").replace(/\/+$/,"");

const FN_ENV = trim(import.meta.env.VITE_FUNCTIONS_BASE_URL);
const SB_ENV = trim(import.meta.env.VITE_SUPABASE_URL);

const DERIVED = SB_ENV
  ? `${SB_ENV.replace(".supabase.co", ".functions.supabase.co")}/functions/v1`
  : "";

export const API_CONFIG = {
  mode: (import.meta.env.VITE_API_MODE as "mock" | "real") ?? "real",
  baseUrl: FN_ENV || DERIVED,
};

if (!API_CONFIG.baseUrl) {
  // Falha rápida e descritiva para evitar fetch em URL vazia
  // (apenas console; não quebra o build)
  // eslint-disable-next-line no-console
  console.error(
    "[API_CONFIG] baseUrl vazio. Defina VITE_FUNCTIONS_BASE_URL ou VITE_SUPABASE_URL corretamente."
  );
}