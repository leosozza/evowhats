export type EvoStatus = { state?: string; status?: string; [k: string]: any };

export type EvoConnectData = {
  instanceName: string;
  line?: string | number;
  status?: EvoStatus | null;
  qr_base64?: string | null;
};

export type EvoQrData = {
  instanceName: string;
  status?: EvoStatus | null;
  qr_base64?: string | null;
};

export type EvoDiagnosticsData = {
  instances?: any[];
  [k: string]: any;
};

export type EvoResponse<T = any> = {
  success: boolean;
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
  instances?: any[];
};