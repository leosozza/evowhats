
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    ...init,
  });
}

async function callBitrixAPI(portalUrl: string, accessToken: string, method: string, params: any) {
  const url = `${portalUrl}/rest/${method}`;
  
  const formData = new FormData();
  
  // Flatten object/array parameters for Bitrix API
  function flattenParams(obj: any, prefix = '') {
    for (const key in obj) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}[${key}]` : key;
      
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (typeof item === 'object' && item !== null) {
            flattenParams(item, `${newKey}[${index}]`);
          } else {
            formData.append(`${newKey}[${index}]`, String(item));
          }
        });
      } else if (typeof value === 'object' && value !== null) {
        flattenParams(value, newKey);
      } else {
        formData.append(newKey, String(value));
      }
    }
  }
  
  flattenParams(params);
  formData.append('auth', accessToken);

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Bitrix API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[evolution-webhook] Missing Supabase environment variables");
      return jsonResponse({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    let webhookData: any;
    try {
      webhookData = await req.json();
    } catch (_) {
      return jsonResponse({ error: "Invalid JSON payload" }, { status: 400 });
    }

    console.log("[evolution-webhook] Received webhook:", JSON.stringify(webhookData, null, 2));

    // Extract Evolution API event data
    const { event, instance, data } = webhookData;
    
    if (!event || !instance) {
      console.log("[evolution-webhook] Missing required fields (event, instance)");
      return jsonResponse({ error: "Missing required fields" }, { status: 400 });
    }

    // Handle different Evolution API events
    if (event === 'messages.upsert' && data?.messages) {
      await handleIncomingMessages(supabase, instance, data.messages);
    } else if (event === 'connection.update') {
      await handleConnectionUpdate(supabase, instance, data);
    } else if (event === 'qrcode.updated' && data?.qr) {
      await handleQrUpdate(supabase, instance, data.qr);
    }

    return jsonResponse({ success: true, message: "Webhook processed" });

  } catch (error: any) {
    console.error("[evolution-webhook] Error processing webhook:", error);
    return jsonResponse({ 
      error: "Internal server error", 
      details: error.message 
    }, { status: 500 });
  }
});

async function handleIncomingMessages(supabase: any, instanceId: string, messages: any[]) {
  console.log("[evolution-webhook] Processing incoming messages for instance:", instanceId);

  // Find the session for this instance
  const { data: session, error: sessionError } = await supabase
    .from('wa_sessions')
    .select('*')
    .eq('evo_instance_id', instanceId)
    .maybeSingle();

  if (sessionError || !session) {
    console.error("[evolution-webhook] Session not found for instance:", instanceId);
    return;
  }

  // Get user's Bitrix credentials
  const { data: credentials, error: credError } = await supabase
    .from('bitrix_credentials')
    .select('*')
    .eq('user_id', session.user_id)
    .eq('is_active', true)
    .maybeSingle();

  if (credError || !credentials) {
    console.error("[evolution-webhook] Bitrix credentials not found for user:", session.user_id);
    return;
  }

  // Process each message
  for (const message of messages) {
    if (message.key?.fromMe) {
      console.log("[evolution-webhook] Skipping outgoing message");
      continue; // Skip messages sent by us
    }

    try {
      // Send message to Bitrix Open Channels
      await sendMessageToBitrix(
        credentials.portal_url,
        credentials.access_token,
        session.bitrix_line_id,
        message
      );

      // Log event for monitoring
      await supabase.from('bitrix_event_logs').insert({
        user_id: session.user_id,
        event_type: 'message_received',
        event_data: {
          instance_id: instanceId,
          line_id: session.bitrix_line_id,
          message_data: message
        },
        status: 'processed'
      });

    } catch (error: any) {
      console.error("[evolution-webhook] Failed to send message to Bitrix:", error);
      
      await supabase.from('bitrix_event_logs').insert({
        user_id: session.user_id,
        event_type: 'message_received',
        event_data: {
          instance_id: instanceId,
          line_id: session.bitrix_line_id,
          message_data: message
        },
        status: 'failed',
        error_message: error.message
      });
    }
  }
}

async function sendMessageToBitrix(portalUrl: string, accessToken: string, lineId: string, message: any) {
  const contactNumber = message.key?.remoteJid?.replace('@s.whatsapp.net', '');
  const messageText = message.message?.conversation || 
                     message.message?.extendedTextMessage?.text || 
                     message.message?.imageMessage?.caption || 
                     'Media message';

  const messageId = message.key?.id || String(Date.now());
  const timestamp = Math.floor((message.messageTimestamp || Date.now()) / 1000);

  const messagesPayload = {
    CONNECTOR: 'evolution_whatsapp',
    LINE: lineId,
    MESSAGES: [{
      user: {
        id: contactNumber,
        name: message.pushName || contactNumber,
        last_name: ''
      },
      message: {
        id: messageId,
        date: timestamp,
        text: messageText
      },
      chat: {
        id: contactNumber,
        name: `WhatsApp Chat ${contactNumber}`,
        url: ''
      }
    }]
  };

  console.log("[evolution-webhook] Sending to Bitrix:", JSON.stringify(messagesPayload, null, 2));

  const result = await callBitrixAPI(portalUrl, accessToken, 'imconnector.send.messages', messagesPayload);
  console.log("[evolution-webhook] Bitrix response:", result);

  return result;
}

async function handleConnectionUpdate(supabase: any, instanceId: string, connectionData: any) {
  console.log("[evolution-webhook] Connection update for instance:", instanceId, connectionData);

  const status = connectionData?.state === 'open' ? 'CONNECTED' : 'DISCONNECTED';

  await supabase
    .from('wa_sessions')
    .update({ 
      status,
      last_sync_at: new Date().toISOString()
    })
    .eq('evo_instance_id', instanceId);
}

async function handleQrUpdate(supabase: any, instanceId: string, qrCode: string) {
  console.log("[evolution-webhook] QR update for instance:", instanceId);

  await supabase
    .from('wa_sessions')
    .update({ 
      qr_code: qrCode,
      status: 'PENDING_QR',
      last_sync_at: new Date().toISOString()
    })
    .eq('evo_instance_id', instanceId);
}
