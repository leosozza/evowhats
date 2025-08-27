
import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RealTimeMessage {
  id: string;
  instanceName: string;
  fromNumber: string;
  toNumber: string;
  message: string;
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document';
  timestamp: string;
  messageId: string;
  isFromMe: boolean;
}

export function useEvolutionRealTime() {
  const queryClient = useQueryClient();
  const [connectedInstances, setConnectedInstances] = useState<string[]>([]);
  const [messages, setMessages] = useState<RealTimeMessage[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);

  // Save incoming message to Supabase
  const saveMessage = useCallback(async (message: RealTimeMessage) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Find or create conversation
      const contactNumber = message.isFromMe ? message.toNumber : message.fromNumber;
      
      let { data: conversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_id', user.id)
        .eq('contact_phone', contactNumber)
        .eq('evolution_instance', message.instanceName)
        .single();

      if (!conversation) {
        // Create new conversation
        const { data: newConversation, error } = await supabase
          .from('conversations')
          .insert({
            user_id: user.id,
            contact_phone: contactNumber,
            evolution_instance: message.instanceName,
            last_message_at: message.timestamp
          })
          .select('id')
          .single();

        if (error) {
          console.error('Error creating conversation:', error);
          return;
        }
        conversation = newConversation;
      }

      // Insert message
      await supabase
        .from('messages')
        .insert({
          conversation_id: conversation.id,
          content: message.message,
          direction: message.isFromMe ? 'out' : 'in',
          message_type: message.messageType,
          evolution_message_id: message.messageId,
          status: 'delivered',
          created_at: message.timestamp
        });

      // Update conversation last message time
      await supabase
        .from('conversations')
        .update({ last_message_at: message.timestamp })
        .eq('id', conversation.id);

      // Invalidate queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] });

    } catch (error) {
      console.error('Error saving message:', error);
    }
  }, [queryClient]);

  // Load connected instances from Evolution API
  const loadConnectedInstances = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
        body: { action: "list_instances" }
      });

      if (error) throw error;
      if (!data?.ok) return;

      const instances = data.instances || [];
      const connected = instances
        .filter((inst: any) => {
          const status = inst.instance?.state || inst.state || 'disconnected';
          return status.toLowerCase() === 'open';
        })
        .map((inst: any) => inst.instanceName || inst.instance?.instanceName || inst.name);
      
      setConnectedInstances(connected);
    } catch (error) {
      console.error('Error loading connected instances:', error);
      setConnectedInstances([]);
    }
  }, []);

  // Process custom event from EvolutionInstanceManager or WebSocket
  useEffect(() => {
    const handleMessagesUpsert = (event: CustomEvent) => {
      const { instanceName, payload } = event.detail;
      
      if (payload?.data) {
        const messages = Array.isArray(payload.data) ? payload.data : [payload.data];
        
        messages.forEach((msgData: any) => {
          const message = msgData.message || msgData;
          
          if (message && message.key) {
            const realTimeMessage: RealTimeMessage = {
              id: `${instanceName}-${message.key.id}`,
              instanceName,
              fromNumber: message.key.remoteJid?.replace('@s.whatsapp.net', '') || '',
              toNumber: message.key.participant?.replace('@s.whatsapp.net', '') || '',
              message: message.message?.conversation || 
                      message.message?.extendedTextMessage?.text ||
                      '[Mídia]',
              messageType: message.message?.imageMessage ? 'image' :
                          message.message?.audioMessage ? 'audio' :
                          message.message?.videoMessage ? 'video' :
                          message.message?.documentMessage ? 'document' : 'text',
              timestamp: new Date(message.messageTimestamp * 1000).toISOString(),
              messageId: message.key.id,
              isFromMe: message.key.fromMe || false
            };

            setMessages(prev => [realTimeMessage, ...prev.slice(0, 99)]); // Keep last 100 messages
            saveMessage(realTimeMessage);
          }
        });
      }
    };

    window.addEventListener('EVO_MESSAGES_UPSERT', handleMessagesUpsert as EventListener);
    
    return () => {
      window.removeEventListener('EVO_MESSAGES_UPSERT', handleMessagesUpsert as EventListener);
    };
  }, [saveMessage]);

  // Load connected instances on mount and periodically
  useEffect(() => {
    loadConnectedInstances();
    const interval = setInterval(loadConnectedInstances, 15000); // Every 15 seconds
    return () => clearInterval(interval);
  }, [loadConnectedInstances]);

  // Get recent messages for display
  const getRecentMessages = useCallback((limit: number = 10) => {
    return messages.slice(0, limit);
  }, [messages]);

  // Get messages by instance
  const getMessagesByInstance = useCallback((instanceName: string, limit: number = 10) => {
    return messages
      .filter(msg => msg.instanceName === instanceName)
      .slice(0, limit);
  }, [messages]);

  // Send message via Evolution API
  const sendMessage = useCallback(async (
    instanceName: string, 
    toNumber: string, 
    message: string
  ): Promise<boolean> => {
    try {
      const response = await supabase.functions.invoke('evolution-connector-v2', {
        body: {
          action: 'test_send',
          lineId: instanceName.replace('evo_line_', ''),
          to: toNumber,
          text: message
        }
      });

      return response.data?.ok || false;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  }, []);

  return {
    connectedInstances,
    messages: getRecentMessages(20),
    isConnecting,
    getMessagesByInstance,
    sendMessage,
    loadConnectedInstances,
  };
}
