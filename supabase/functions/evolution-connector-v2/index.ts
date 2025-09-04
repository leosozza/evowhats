import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = body?.action;

  // Log estruturado (aparece em supabase functions logs)
  console.log(JSON.stringify({ category: "EVO_ADAPTER", step: "RECEIVED", action, hasBody: !!body }));

  if (action === "diag") {
    return new Response(JSON.stringify({ ok: true, steps: {} }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }

  if (action === "list_instances") {
    return new Response(JSON.stringify({ ok: true, instances: [] }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }

  // Fallback controlado (NUNCA 500 aqui)
  return new Response(JSON.stringify({ ok: false, error: "unknown_action", got: action }), {
    status: 400, headers: { ...CORS, "Content-Type": "application/json" }
  });
});