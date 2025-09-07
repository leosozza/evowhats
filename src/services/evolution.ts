import type { Transport } from "@/core/transport";
import type { Result } from "@/core/result";

export type EvoInstance = {
  id: string;
  label?: string;
  state?: string;
  owner?: string;
  profileName?: string;
  profilePictureUrl?: string;
  connectedAt?: string;
  lastActivity?: string;
};

export type EvoDiag = {
  ok: boolean;
  steps: Record<string, unknown>;
};

export type EvoQrResponse = {
  line?: string;
  qr_base64?: string;
  base64?: string;
};

export type EvoStatusResponse = {
  line?: string;
  state?: string;
  raw?: any;
};

export const Evolution = (T: Transport) => {
  const post = <TRes>(body: unknown) => 
    T.request<TRes>({ 
      url: "/evolution-connector-v2", 
      method: "POST", 
      body, 
      timeoutMs: 15000 
    });

  return {
    diag(): Promise<Result<EvoDiag>> {
      return post({ action: "diag" });
    },

    list(): Promise<Result<{ instances: EvoInstance[] }>> {
      return post({ action: "list_instances" });
    },

    ensure(lineId: string): Promise<Result<{ line: string; instance: string }>> {
      return post({ action: "ensure_line_session", lineId });
    },

    start(lineId: string, number?: string): Promise<Result<{ line: string; base64?: string }>> {
      return post({ action: "start_session_for_line", lineId, number });
    },

    status(lineId: string): Promise<Result<EvoStatusResponse>> {
      return post({ action: "get_status_for_line", lineId });
    },

    qr(lineId: string): Promise<Result<EvoQrResponse>> {
      return post({ action: "get_qr_for_line", lineId });
    },

    testSend(lineId: string, to: string, text = "Ping"): Promise<Result<{ result: any }>> {
      return post({ action: "test_send", lineId, to, text });
    },

    bind(instanceId: string, lineId: string): Promise<Result<{ success: boolean }>> {
      return post({ action: "bind_line", instanceId, lineId });
    },
  };
};