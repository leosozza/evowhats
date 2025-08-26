
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings } from "lucide-react";
import AutoConnectBitrix from "./bitrix/AutoConnectBitrix";
import { useBitrixTokenRefresh } from "@/hooks/useBitrixTokenRefresh";

const BitrixConnectionManager = () => {
  // Hook para refresh automático dos tokens
  useBitrixTokenRefresh();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Conexão Bitrix24
        </CardTitle>
      </CardHeader>
      <CardContent>
        <AutoConnectBitrix />
      </CardContent>
    </Card>
  );
};

export default BitrixConnectionManager;
