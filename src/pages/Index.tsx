
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Dashboard from "@/components/Dashboard";

const Index = () => {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Verificar se chegaram parâmetros de callback do Bitrix24
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const domain = searchParams.get("domain");
    const member_id = searchParams.get("member_id");
    const scope = searchParams.get("scope");

    if (code && state && domain) {
      console.log("[Index] Bitrix OAuth callback detected, redirecting to edge function...");
      
      // Construir URL da edge function com todos os parâmetros
      const callbackUrl = new URL("https://twqcybbjyhcokcrdfgkk.functions.supabase.co/bitrix-oauth-callback");
      callbackUrl.searchParams.set("code", code);
      callbackUrl.searchParams.set("state", state);
      callbackUrl.searchParams.set("domain", domain);
      if (member_id) callbackUrl.searchParams.set("member_id", member_id);
      if (scope) callbackUrl.searchParams.set("scope", scope);

      // Redirecionar para a edge function
      window.location.href = callbackUrl.toString();
      return;
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Dashboard />
    </div>
  );
};

export default Index;
