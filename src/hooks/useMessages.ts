
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMessages, DBMessage } from "@/services/chatApi";
import { supabase } from "@/integrations/supabase/client";

export function useMessages(conversationId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery<DBMessage[]>({
    queryKey: ["messages", conversationId],
    queryFn: () => {
      if (!conversationId) return Promise.resolve([]);
      return fetchMessages(conversationId);
    },
    enabled: !!conversationId,
  });

  useEffect(() => {
    if (!conversationId) return;

    console.log("[useMessages] subscribing to realtime changes for", conversationId);
    const channel = supabase
      .channel(`messages-changes-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log("[useMessages] change payload:", payload);
          queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  return query;
}
