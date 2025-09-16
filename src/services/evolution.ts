import type { Transport } from "@/core/transport";
import type { Result } from "@/core/result";

export type EvoInstance = { 
  id: string; 
  label?: string; 
  state?: string;
  instanceName?: string;
  instance?: string;
};

export type EvoDiag = { 
  ok: boolean; 
  steps: Record<string, {
    ok?: boolean;
    instanceCount?: number;
    status?: number;
    reason?: string;
    error?: string;
  }>;
  error?: string;
};

export type EvoQrResponse = {
  line?: string;
  qr_base64?: string;
  base64?: string;
  qr?: string;
};

export type EvoStatusResponse = {
  line?: string;
  state?: string;
  raw?: any;
};

export type EvoEnsureResponse = {
  line: string;
  instance: string;
  exists: boolean;
  created?: boolean;
  message?: string;
};

export type EvoStartResponse = {
  line: string;
  base64?: string;
  instance: string;
  created?: boolean;
  message?: string;
  qr?: string;
};

export type EvoBindResponse = {
  message: string;
  binding: any;
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

    diagEvolution(): Promise<Result<{ instances: EvoInstance[]; status: number }>> {
      return post({ action: "diag_evolution" });
    },

    list(): Promise<Result<{ instances: EvoInstance[] }>> {
      return post({ action: "list_instances" });
    },

    ensure(lineId: string, instanceName?: string): Promise<Result<EvoEnsureResponse>> {
      return post({ action: "ensure_line_session", lineId, instanceName });
    },

    start(lineId: string, number?: string, instanceName?: string): Promise<Result<EvoStartResponse>> {
      return post({ action: "start_session_for_line", lineId, number, instanceName });
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

    bindOpenLine(lineId: string, instanceName: string): Promise<Result<EvoBindResponse>> {
      return post({ action: "bind_openline", lineId, instanceName });
    },
  };
};