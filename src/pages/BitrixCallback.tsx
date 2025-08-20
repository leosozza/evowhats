
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

export default function BitrixCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");

    console.log("[BitrixCallback] Received params:", { 
      success: !!success, 
      error
    });

    if (error) {
      setStatus("error");
      setMessage(error);
      
      // Enviar mensagem de erro para o opener
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ source: "bitrix-oauth", ok: false, error }, "*");
        }
      } catch (e) {
        console.error("[BitrixCallback] Failed to send error postMessage:", e);
      }
      return;
    }

    if (success === "true") {
      setStatus("success");
      setMessage("Integração configurada com sucesso!");
      
      // Enviar mensagem de sucesso para o opener
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ source: "bitrix-oauth", ok: true }, "*");
          window.opener.postMessage("bitrix_oauth_success", "*");
        }
      } catch (e) {
        console.error("[BitrixCallback] Failed to send success postMessage:", e);
      }
      
      // Fechar a aba/popup após 2 segundos
      setTimeout(() => {
        if (window.opener) {
          window.close();
        } else {
          // Se não é popup, redirecionar para home
          navigate("/");
        }
      }, 2000);
    } else {
      // Sem parâmetros específicos, tratar como processamento
      setStatus("processing");
      setMessage("Processando autorização...");
    }
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-auto p-6 text-center">
        {status === "processing" && (
          <div className="space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <h2 className="text-xl font-semibold">Processando autorização...</h2>
            <p className="text-muted-foreground">
              Finalizando a conexão com o Bitrix24.
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
            <button 
              onClick={() => window.close()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Fechar aba
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
