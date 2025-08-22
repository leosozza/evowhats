
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchConversations, DBConversation } from "@/services/chatApi";
import { supabase } from "@/integrations/supabase/client";

export function useConversations() {
  const queryClient = useQueryClient();

  const query = useQuery<DBConversation[]>({
    queryKey: ["conversations"],
    queryFn: fetchConversations,
  });

  useEffect(() => {
    console.log("[useConversations] subscribing to realtime changes...");
    const channel = supabase
      .channel("conversations-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        (payload) => {
          console.log("[useConversations] change payload:", payload);
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}
