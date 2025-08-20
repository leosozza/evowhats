
import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type UseSupabaseAuth = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

export function useSupabaseAuth(): UseSupabaseAuth {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("[auth] Initializing auth listener...");
    
    // Configurar listener primeiro
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      console.log("[auth] onAuthStateChange:", _event, newSession?.user?.email);
      setSession(newSession);
      setLoading(false);
    });

    // Depois verificar sessão existente
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error("[auth] getSession error:", error);
      } else {
        console.log("[auth] getSession result:", data.session?.user?.email);
        setSession(data.session);
      }
      setLoading(false);
    }).catch((error) => {
      console.error("[auth] getSession failed:", error);
      setLoading(false);
    });

    return () => {
      console.log("[auth] Cleaning up auth listener...");
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    console.log("[auth] Signing out...");
    try {
      await supabase.auth.signOut();
      setSession(null);
    } catch (error) {
      console.error("[auth] Sign out error:", error);
    }
  };

  return {
    session,
    user: session?.user ?? null,
    loading,
    signOut,
  };
}
