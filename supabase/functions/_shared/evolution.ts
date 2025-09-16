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
  evo(P_CONNECT, "POST", { instanceName: name });
export const getStatus = (name: string) =>
  evo(P_STATUS, "POST", { instanceName: name });
export const getQr = (name: string) =>
  evo(P_QR, "POST", { instanceName: name });

export function normalizeQr(data: any): string | null {
  const pick = (v: any) => (typeof v === "string" && v.length > 50 ? v : null);
  const cands = [data?.base64, data?.qr_base64, data?.qr, data?.qrcode, data?.qrCode, data?.image?.base64, data?.data?.qr?.base64, data?.data?.qrcode];
  for (const c of cands) { const hit = pick(c); if (hit) return hit.startsWith("data:") ? hit.split(",")[1] : hit; }
  return null;
}
export const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function ensureInstance(name: string, autoCreate = true) {
  const li = await listInstances().catch(() => null);
  if (li?.ok && Array.isArray(li.data)) {
    const hit = li.data.find((it: any) =>
      it?.instanceName === name || it?.name === name || it?.id === name);
    if (hit) return { exists: true, created: false, data: hit };
  }
  const st = await getStatus(name).catch(() => null);
  if (st?.ok) return { exists: true, created: false, data: st.data };
  if (!autoCreate) return { exists: false, created: false };
  const cr = await createInstance(name);
  if (cr.ok || cr.status === 201 || cr.status === 409) {
    return { exists: true, created: cr.status !== 409, data: cr.data };
  }
  return { exists: false, created: false, error: cr.data };
}