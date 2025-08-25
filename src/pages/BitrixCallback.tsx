
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

export default function BitrixCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const error = searchParams.get("error");
      const errorDescription = searchParams.get("error_description");

      console.log("[BitrixCallback] Processing callback:", { 
        hasCode: !!code, 
        hasState: !!state,
        error,
        errorDescription,
        origin: window.location.origin,
        hasOpener: !!window.opener
      });

      // Se há erro explícito nos parâmetros
      if (error) {
        console.error("[BitrixCallback] OAuth error from Bitrix:", error, errorDescription);
        setStatus("error");
        setMessage(errorDescription || error);
        
        // Notificar erro para o opener
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ 
              source: "bitrix-oauth", 
              ok: false, 
              error: errorDescription || error 
            }, window.location.origin);
          }
        } catch (e) {
          console.error("[BitrixCallback] Failed to send error postMessage:", e);
        }
        return;
      }

      // Se não há code, é um erro
      if (!code) {
        setStatus("error");
        setMessage("Código de autorização não recebido");
        
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ 
              source: "bitrix-oauth", 
              ok: false, 
              error: "Código de autorização não recebido" 
            }, window.location.origin);
          }
        } catch (e) {
          console.error("[BitrixCallback] Failed to send error postMessage:", e);
        }
        return;
      }

      // Se não há state, é um erro de segurança
      if (!state) {
        setStatus("error");
        setMessage("State de segurança não encontrado");
        
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ 
              source: "bitrix-oauth", 
              ok: false, 
              error: "State de segurança inválido" 
            }, window.location.origin);
          }
        } catch (e) {
          console.error("[BitrixCallback] Failed to send error postMessage:", e);
        }
        return;
      }

      try {
        setStatus("processing");
        setMessage("Trocando código por tokens...");

        // A troca do code por tokens será feita pelo bitrix-oauth-callback
        // que já foi executado e redirecionou para cá
        
        // Verificar se chegamos aqui com sucesso
        const success = searchParams.get("success");
        
        if (success === "true") {
          console.log("[BitrixCallback] OAuth exchange successful");
          setStatus("success");
          setMessage("Integração OAuth configurada com sucesso!");
          
          // Notificar sucesso para o opener
          try {
            if (window.opener && !window.opener.closed) {
              console.log("[BitrixCallback] Sending success message to opener");
              window.opener.postMessage({ 
                source: "bitrix-oauth", 
                ok: true 
              }, window.location.origin);
              
              // Enviar também a mensagem legacy para compatibilidade
              window.opener.postMessage("bitrix_oauth_success", window.location.origin);
            }
          } catch (e) {
            console.error("[BitrixCallback] Failed to send success postMessage:", e);
          }
          
          // Fechar a aba/popup após 2 segundos
          setTimeout(() => {
            if (window.opener && !window.opener.closed) {
              window.close();
            } else {
              // Se não é popup, redirecionar para home
              navigate("/");
            }
          }, 2000);
          
        } else {
          // Se chegamos aqui sem success=true, algo deu errado no backend
          const backendError = searchParams.get("error");
          setStatus("error");
          setMessage(backendError || "Erro desconhecido na troca de tokens");
          
          try {
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage({ 
                source: "bitrix-oauth", 
                ok: false, 
                error: backendError || "Erro na troca de tokens" 
              }, window.location.origin);
            }
          } catch (e) {
            console.error("[BitrixCallback] Failed to send error postMessage:", e);
          }
        }

      } catch (error: any) {
        console.error("[BitrixCallback] Unexpected error:", error);
        setStatus("error");
        setMessage(`Erro inesperado: ${error.message}`);
        
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ 
              source: "bitrix-oauth", 
              ok: false, 
              error: error.message 
            }, window.location.origin);
          }
        } catch (e) {
          console.error("[BitrixCallback] Failed to send error postMessage:", e);
        }
      }
    };

    processCallback();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-auto p-6 text-center">
        {status === "processing" && (
          <div className="space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <h2 className="text-xl font-semibold">Processando autorização...</h2>
            <p className="text-muted-foreground">
              {message || "Finalizando a conexão com o Bitrix24."}
            </p>
          </div>
        )}
        
        {status === "success" && (
          <div className="space-y-4">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-green-700">✅ Conexão realizada!</h2>
            <p className="text-muted-foreground">{message}</p>
            <p className="text-sm text-muted-foreground">Esta aba será fechada automaticamente.</p>
          </div>
        )}
        
        {status === "error" && (
          <div className="space-y-4">
            <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-red-700">Erro na autorização</h2>
            <p className="text-muted-foreground">{message}</p>
            <div className="flex gap-2 justify-center">
              <button 
                onClick={() => window.close()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Fechar aba
              </button>
              <button 
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
