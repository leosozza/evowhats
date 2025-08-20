
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { getBitrixAuthStatus, type BitrixAuthStatus } from "@/services/bitrixAuthStatus";

interface ConnectionStatusProps {
  title: string;
  status: "connected" | "disconnected" | "connecting";
  description: string;
  icon: React.ReactNode;
}

const ConnectionStatus = ({ title, status, description, icon }: ConnectionStatusProps) => {
  const [bitrixStatus, setBitrixStatus] = useState<BitrixAuthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkBitrixStatus = async () => {
      if (title === "Bitrix24") {
        try {
          const status = await getBitrixAuthStatus();
          setBitrixStatus(status);
        } catch (error) {
          console.error("Error checking Bitrix status:", error);
        }
      }
      setLoading(false);
    };

    checkBitrixStatus();
    
    // Refresh status every 30 seconds for Bitrix24
    const interval = title === "Bitrix24" ? setInterval(checkBitrixStatus, 30000) : null;
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [title]);

  // Override status and description for Bitrix24 based on OAuth status
  let finalStatus = status;
  let finalDescription = description;

  if (title === "Bitrix24" && !loading && bitrixStatus) {
    if (bitrixStatus.isConnected && bitrixStatus.hasValidTokens) {
      finalStatus = "connected";
      finalDescription = `✅ Conectado via OAuth - ${bitrixStatus.portalUrl}`;
    } else if (bitrixStatus.isConnected && !bitrixStatus.hasValidTokens) {
      finalStatus = "connecting";
      finalDescription = "⚠️ Token expirado - Reconnecte via OAuth";
    } else {
      finalStatus = "disconnected";
      finalDescription = bitrixStatus.error || "Configure suas credenciais OAuth";
    }
  }

  const getStatusColor = () => {
    switch (finalStatus) {
      case "connected":
        return "text-green-600 bg-green-50 border-green-200";
      case "connecting":
        return "text-orange-600 bg-orange-50 border-orange-200";
      case "disconnected":
        return "text-red-600 bg-red-50 border-red-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  return (
    <Card className={`p-4 border-2 card-hover ${getStatusColor()}`}>
      <div className="flex items-start space-x-3">
        <div className="mt-1">{icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm">{title}</h3>
          <p className="text-xs mt-1 break-words">{finalDescription}</p>
          {loading && title === "Bitrix24" && (
            <p className="text-xs mt-1 opacity-60">Verificando status...</p>
          )}
        </div>
      </div>
    </Card>
  );
};

export default ConnectionStatus;
