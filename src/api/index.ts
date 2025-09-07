import { createFetchTransport } from "@/core/fetchTransport";
import { createMockTransport } from "@/core/mockTransport";
import { Evolution } from "@/services/evolution";
import { Bitrix } from "@/services/bitrix";

type Mode = "mock" | "real";

type ApiConfig = {
  mode: Mode;
  baseUrl: string;
  bearer?: string;
};

export const createApi = (cfg: ApiConfig) => {
  const real = createFetchTransport({
    baseUrl: cfg.baseUrl,
    bearer: cfg.bearer,
    retries: 2,
    backoffMs: 400,
    logger: (x) => console.debug("[HTTP]", x),
  });

  const mocks = createMockTransport({
    "POST /evolution-connector-v2": (spec) => {
      const a = (spec.body as any)?.action;
      if (a === "diag") return { ok: true, steps: { fetchInstances: "mock-ok" } };
      if (a === "list_instances") return { instances: [{ id: "evo_line_15", state: "open" }] };
      if (a === "get_qr_for_line") return { qr_base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" };
      if (a === "get_status_for_line") return { line: "15", state: "connecting" };
      if (a === "ensure_line_session") return { line: "15", instance: "evo_line_15" };
      if (a === "start_session_for_line") return { line: "15", base64: "mock-qr-code" };
      if (a === "test_send") return { result: { success: true, messageId: "mock-123" } };
      if (a === "bind_line") return { success: true };
      throw new Error(`mock unknown action: ${a}`);
    },
    "POST /bitrix-openlines": (spec) => {
      const a = (spec.body as any)?.action;
      if (a === "list_lines") return { lines: [{ id: "15", name: "Suporte" }, { id: "16", name: "Vendas" }] };
      if (a === "bind_line") return { success: true };
      return { lines: [] };
    },
    "POST /bitrix-events": () => ({ ok: true, portal: "https://xxx.bitrix24.com.br" }),
  });

  const T = cfg.mode === "mock" ? mocks : real;

  return {
    evolution: Evolution(T),
    bitrix: Bitrix(T),
  };
};