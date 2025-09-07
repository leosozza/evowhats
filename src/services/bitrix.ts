import type { Transport } from "@/core/transport";
import type { Result } from "@/core/result";

export type BitrixLine = {
  id: string;
  name: string;
  code?: string;
  active?: boolean;
};

export type BitrixTokenStatus = {
  ok: boolean;
  portal?: string;
  expires_at?: string;
  scope?: string[];
};

export const Bitrix = (T: Transport) => {
  const post = <TRes>(url: string, body: unknown) => 
    T.request<TRes>({ 
      url, 
      method: "POST", 
      body, 
      timeoutMs: 15000 
    });

  return {
    tokenStatus(): Promise<Result<BitrixTokenStatus>> {
      return post("/bitrix-events", { action: "token_status" });
    },

    listLines(): Promise<Result<{ lines: BitrixLine[] }>> {
      return post("/bitrix-openlines", { action: "list_lines" });
    },

    bindLine(lineId: string, instanceId: string): Promise<Result<{ success: boolean }>> {
      return post("/bitrix-openlines", { action: "bind_line", lineId, instanceId });
    },
  };
};