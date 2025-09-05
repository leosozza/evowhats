import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "*")
  .split(/[\s,]+/)
  .filter(Boolean);

function cors(origin?: string | null) {
  const allowed = origin && (ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin)) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed || (ALLOWED_ORIGINS[0] || "*"),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    Vary: "Origin",
  } as Record<string, string>;
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Helper to check table visibility by selecting zero rows
  async function checkTable(name: string) {
    try {
      const { error } = await service.from(name).select("*").limit(0);
      return { name, exists: !error };
    } catch (e) {
      return { name, exists: false, error: String(e) };
    }
  }

  // NOTE: Edge Functions cannot run DDL. This function validates schema presence only.
  const checks = await Promise.all([
    "tenants",
    "bitrix_tokens",
    "wa_instances",
    "open_channel_bindings",
    "contacts",
    "conversations",
    "messages",
  ].map(checkTable));

  const missing = checks.filter(c => !c.exists).map(c => c.name);

  const payload = {
    ok: missing.length === 0,
    missing,
    note: missing.length === 0
      ? "Schema OK"
      : "Algumas tabelas ausentes. Aplique migrations no Supabase (DDL).",
    rls: "Certifique-se de que RLS está habilitado por tabela com policies por tenant_id.",
  };

  if (req.method === "GET") {
    return new Response(JSON.stringify(payload), { headers: { ...cors(origin), "Content-Type": "application/json" } });
  }

  // POST: tentativa de auto-criação não suportada via REST; retorna instruções
  return new Response(JSON.stringify(payload), { headers: { ...cors(origin), "Content-Type": "application/json" } });
});