const BASE = Deno.env.get("EVOLUTION_BASE_URL")!;
const KEY  = Deno.env.get("EVOLUTION_API_KEY")!;
const P_LIST    = Deno.env.get("EVOLUTION_PATH_LIST")    ?? "/instances";
const P_CREATE  = Deno.env.get("EVOLUTION_PATH_CREATE")  ?? "/instance/create";
const P_CONNECT = Deno.env.get("EVOLUTION_PATH_CONNECT") ?? "/instance/connect";
const P_STATUS  = Deno.env.get("EVOLUTION_PATH_STATUS")  ?? "/instance/status";
const P_QR      = Deno.env.get("EVOLUTION_PATH_QR")      ?? "/instance/qr";
const INTEGRATION = Deno.env.get("EVOLUTION_INTEGRATION") ?? "WHATSAPP-BAILEYS";

type HM = "GET"|"POST";
async function evo(path: string, method: HM = "GET", body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { "Content-Type": "application/json", "apikey": KEY }
  });
  let data: any = null; try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
}

export const listInstances = () => evo(P_LIST, "GET");
export const createInstance = (name: string) =>
  evo(P_CREATE, "POST", { instanceName: name, integration: INTEGRATION, qrcode: true });
export const connectInstance = (name: string) =>
  evo(P_CONNECT, "POST", { instanceName: name }); // aciona geração de QR
export const getStatus = (name: string) =>
  evo(P_STATUS, "POST", { instanceName: name });
export const getQr = (name: string) =>
  evo(P_QR, "POST", { instanceName: name });

export function normalizeQr(data: any): string | null {
  const pick = (v: any) => (typeof v === "string" && v.length > 50 ? v : null);
  const candidates = [
    data?.base64, data?.qr_base64, data?.qr, data?.qrcode, data?.qrCode,
    data?.image?.base64, data?.data?.qr?.base64, data?.data?.qrcode
  ];
  for (const c of candidates) {
    const hit = pick(c);
    if (hit) return hit.startsWith("data:") ? hit.split(",")[1] : hit;
  }
  return null;
}
export const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

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
  const cr = await createInstance(instanceName);
  if (cr.ok || cr.status === 201 || cr.status === 200 || cr.status === 409 /* já existe */) {
    return { created: cr.status !== 409, exists: true, status: cr.status, data: cr.data };
  }
  return { created: false, exists: false, status: cr.status, data: cr.data };
}