// Utilitário robusto p/ Evolution API com rotas configuráveis
const BASE = Deno.env.get("EVOLUTION_BASE_URL")!;
const KEY  = Deno.env.get("EVOLUTION_API_KEY")!;
const P_LIST   = Deno.env.get("EVOLUTION_PATH_LIST")   ?? "/instances";
const P_CREATE = Deno.env.get("EVOLUTION_PATH_CREATE") ?? "/instance/create";
const P_STATUS = Deno.env.get("EVOLUTION_PATH_STATUS") ?? "/instance/status";
const P_QR     = Deno.env.get("EVOLUTION_PATH_QR")     ?? "/instance/qr";
const INTEGRATION = Deno.env.get("EVOLUTION_INTEGRATION") ?? "WHATSAPP-BAILEYS";

type HttpMethod = "GET"|"POST"|"PUT"|"DELETE";

async function evoFetch(path: string, method: HttpMethod = "GET", body?: any) {
  const url = `${BASE}${path}`;
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      "apikey": KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  };
  const res = await fetch(url, init);
  let data: any = null;
  try { data = await res.json(); } catch { /* alguns endpoints podem não retornar JSON */ }
  return { ok: res.ok, status: res.status, data };
}

export async function listInstances() {
  return evoFetch(P_LIST, "GET");
}

export async function createInstance(instanceName: string, opts?: { integration?: string; qrcode?: boolean }) {
  const payload = {
    instanceName,
    integration: opts?.integration ?? INTEGRATION,
    qrcode: opts?.qrcode ?? false,
  };
  // Tentar rota padrão; se 404, tentar alguns fallbacks comuns
  const first = await evoFetch(P_CREATE, "POST", payload);
  if (first.status !== 404) return first;

  const fallbacks = ["/instances/create", "/instance", "/instances"];
  for (const p of fallbacks) {
    const r = await evoFetch(p, "POST", payload);
    if (r.ok || r.status !== 404) return r;
  }
  return first;
}

export async function getStatus(instanceName: string) {
  // Tentar status by-name por body e por query
  let r = await evoFetch(P_STATUS, "POST", { instanceName });
  if (r.status === 404) r = await evoFetch(`${P_STATUS}?instanceName=${encodeURIComponent(instanceName)}`, "GET");
  return r;
}

export async function getQr(instanceName: string) {
  let r = await evoFetch(P_QR, "POST", { instanceName });
  if (r.status === 404) r = await evoFetch(`${P_QR}?instanceName=${encodeURIComponent(instanceName)}`, "GET");
  return r;
}

export async function ensureInstance(instanceName: string, autoCreate = true) {
  // 1) Ver se existe listando (melhor desempenho quando servidor suporta)
  const list = await listInstances();
  if (list.ok && Array.isArray(list.data)) {
    const hit = list.data.find((it: any) =>
      it?.instanceName === instanceName || it?.name === instanceName || it?.id === instanceName);
    if (hit) return { created: false, exists: true, status: 200, data: hit };
  }
  // 2) Consultar status por nome
  const st = await getStatus(instanceName);
  if (st.ok) return { created: false, exists: true, status: st.status, data: st.data };

  // 3) Criar se habilitado
  if (!autoCreate) return { created: false, exists: false, status: 404, data: { error: "INSTANCE_NOT_FOUND" } };
  const cr = await createInstance(instanceName, { qrcode: true });
  if (cr.ok || cr.status === 201 || cr.status === 200 || cr.status === 409 /* já existe */) {
    return { created: cr.status !== 409, exists: true, status: cr.status, data: cr.data };
  }
  return { created: false, exists: false, status: cr.status, data: cr.data };
}