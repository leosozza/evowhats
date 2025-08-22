
// /supabase/functions/evolution-webhook/index.ts
// Recebe eventos Evolution: QRCODE_UPDATED / CONNECTION_UPDATE / MESSAGES_UPSERT
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function ok(data: any) {
  return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
}
function ko(msg: string) {
  return new Response(JSON.stringify({ ok: false, error: msg }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return ko("method_not_allowed");

  try {
    const payload = await req.json().catch(()=> ({}));
    console.log("[evolution-webhook] Received event:", payload?.event, payload);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      const { event, instance, data } = payload;
      
      if (event === 'QRCODE_UPDATED' && instance && data?.qr) {
        // Atualizar QR code na sessão
        await supabase
          .from('wa_sessions')
          .update({ 
            qr_code: data.qr,
            status: 'PENDING_QR',
            last_sync_at: new Date().toISOString()
          })
          .eq('evo_instance_id', instance);
        
        console.log(`[evolution-webhook] Updated QR for instance: ${instance}`);
      }
      
      if (event === 'CONNECTION_UPDATE' && instance) {
        const status = data?.state === 'open' ? 'CONNECTED' : 'DISCONNECTED';
        await supabase
          .from('wa_sessions')
          .update({ 
            status,
            qr_code: status === 'CONNECTED' ? null : undefined,
            connected_at: status === 'CONNECTED' ? new Date().toISOString() : undefined,
            last_sync_at: new Date().toISOString()
          })
          .eq('evo_instance_id', instance);
        
        console.log(`[evolution-webhook] Updated connection status for instance: ${instance} -> ${status}`);
      }
      
      if (event === 'MESSAGES_UPSERT' && instance && data?.messages) {
        // Processar mensagens recebidas
        for (const message of data.messages) {
          if (!message.key?.fromMe) {
            console.log(`[evolution-webhook] New message for instance ${instance}:`, message);
            // Aqui você pode implementar o salvamento da mensagem
            // e/ou integração com Bitrix
          }
        }
      }
    }

    return ok({ received: true });
  } catch (e: any) {
    console.error("[evolution-webhook] Error:", e);
    return ko(e?.message || "internal_error");
  }
});
