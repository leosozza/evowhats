export const ENV = {
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL as string,
  SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
  API_MODE: (import.meta.env.VITE_API_MODE as "mock" | "real") ?? "real",
  FUNCTIONS_BASE_URL:
    (import.meta.env.VITE_FUNCTIONS_BASE_URL as string) ||
    (() => {
      // Deriva https://<ref>.functions.supabase.co/functions/v1 (correto)
      const url = (import.meta.env.VITE_SUPABASE_URL as string) || "";
      try {
        const u = new URL(url);
        const ref = u.hostname.split('.')[0]; // extrai ref do projeto
        return `https://${ref}.functions.supabase.co/functions/v1`;
      } catch {
        return "https://twqcybbjyhcokcrdfgkk.functions.supabase.co/functions/v1";
      }
    })(),
  BITRIX_CLIENT_ID: import.meta.env.VITE_BITRIX_CLIENT_ID as string | undefined,
  BITRIX_SCOPE: (import.meta.env.VITE_BITRIX_SCOPE as string) || "imopenlines imconnector im placement crm user event event_bind",
};