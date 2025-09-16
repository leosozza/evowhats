const BASE = Deno.env.get("EVOLUTION_BASE_URL");
if (!BASE) throw new Error("EVOLUTION_CONFIG_MISSING: defina EVOLUTION_BASE_URL");

const KEY  = Deno.env.get("EVOLUTION_API_KEY") || "";
const AUTH_SCHEME = (Deno.env.get("EVOLUTION_AUTH_SCHEME") || "apikey").toLowerCase(); // apikey|bearer|custom
const AUTH_PREFIX = Deno.env.get("EVOLUTION_AUTH_PREFIX") ?? "";
const AUTH_HEADER = Deno.env.get("EVOLUTION_AUTH_HEADER") ?? (AUTH_SCHEME==="custom" ? "X-Api-Key" : "apikey");

// Paths com override por ENV (senão defaults estáveis)
const PATH_LIST   = Deno.env.get("EVOLUTION_PATH_LIST")   || "/instances";
const PATH_CREATE = Deno.env.get("EVOLUTION_PATH_CREATE") || "/instance/create";
const PATH_CONNECT= Deno.env.get("EVOLUTION_PATH_CONNECT")|| "/instance/connect";
const PATH_STATUS = Deno.env.get("EVOLUTION_PATH_STATUS") || "/instance/status";
const PATH_QR     = Deno.env.get("EVOLUTION_PATH_QR")     || "/instance/qr";

function joinUrl(base: string, path: string) {
  let b = base.replace(/\/+$/,"");
  let p = path.startsWith("/") ? path : `/${path}`;
  // evita /api/api
  const segs = ["api","v1","evolution"];
  for (const seg of segs) {
    const suf = `/${seg}`;
    if (b.toLowerCase().endsWith(suf) && p.toLowerCase().startsWith(suf + "/")) {
      p = p.slice(suf.length);
      break;
    }
  }
  return `${b}${p}`;
}

function authHeaders() {
  const h:any = { "Content-Type":"application/json" };
  if (!KEY) return h;
  if (AUTH_SCHEME==="bearer") h["Authorization"] = `${AUTH_PREFIX}${KEY}`;
  else if (AUTH_SCHEME==="custom") h[AUTH_HEADER] = `${AUTH_PREFIX}${KEY}`;
  else h["apikey"] = KEY;
  return h;
}

async function evo(path:string, method:"GET"|"POST", body?:any) {
  const url = joinUrl(BASE!, path);
  const init:any = { method, headers: authHeaders() };
  if (body && method!=="GET") init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  const data = await res.json().catch(()=>null);
  return { ok: res.ok, status: res.status, data, url };
}

export async function listInstances() {
  return evo(PATH_LIST, "GET");
}

export async function createInstance(instanceName:string, integration="bitrix") {
  const payloads = [
    { instanceName, integration },
    { instance: instanceName, integration },
    { name: instanceName, integration }
  ];
  for (const b of payloads) {
    const r = await evo(PATH_CREATE, "POST", b);
    if (r.ok || r.status===201 || r.status===409) return { ok:true, status:r.status, data:r.data, url:r.url };
  }
  return { ok:false, status:400 };
}

export async function connectInstance(instanceName:string) {
  const payloads = [ { instanceName }, { instance: instanceName }, { name: instanceName } ];
  for (const b of payloads) {
    const r = await evo(PATH_CONNECT, "POST", b);
    if (r.ok || r.status===200) return { ok:true, status:r.status, data:r.data, url:r.url };
  }
  return { ok:false, status:400 };
}

export async function getStatus(instanceName:string) {
  const payloads = [ { instanceName }, { instance: instanceName }, { name: instanceName } ];
  for (const b of payloads) {
    const r = await evo(PATH_STATUS, "POST", b);
    if (r.ok) return { ok:true, status:r.status, data:r.data };
  }
  return { ok:false, status:400 };
}

export async function getQr(instanceName:string) {
  const payloads = [ { instanceName }, { instance: instanceName }, { name: instanceName } ];
  for (const b of payloads) {
    const r = await evo(PATH_QR, "POST", b);
    if (r.ok) return { ok:true, status:r.status, data:r.data };
  }
  return { ok:false, status:400 };
}

export function normalizeQr(data:any): string|null {
  const pick = (v:any) => (typeof v==="string" && v.length>50 ? v : null);
  const c = [ data?.base64, data?.qr_base64, data?.qr, data?.qrcode, data?.qrCode, data?.image?.base64, data?.data?.qr?.base64, data?.data?.qrcode ];
  for (const it of c) { const hit = pick(it); if (hit) return hit.startsWith("data:") ? hit.split(",")[1] : hit; }
  return null;
}

export const delay = (ms:number)=> new Promise(r=>setTimeout(r, ms));

// ensureInstance simples (lista e compara nomes comuns; cria se precisar)
export async function ensureInstance(instanceName: string, autoCreate=true) {
  const list = await listInstances();
  if (list.ok && list.data) {
    const arr = Array.isArray(list.data) ? list.data : (list.data.instances || []);
    const exists = arr.some((i:any) =>
      i?.instanceName===instanceName || i?.instance===instanceName || i?.name===instanceName
    );
    if (exists) return { ok:true, exists:true };
  }
  if (autoCreate) {
    const created = await createInstance(instanceName);
    return { ok: created.ok, exists:false, created: created.ok };
  }
  return { ok:false, exists:false };
}

// Métodos de discovery/diagnóstico (versão simples)
export async function getDiscovered() {
  return {
    env: {
      base_set: !!BASE, key_set: !!KEY,
      scheme: AUTH_SCHEME, header: AUTH_HEADER,
      prefix: AUTH_PREFIX || (AUTH_SCHEME === "bearer" ? "Bearer " : ""),
      base: BASE,
    },
    paths: {
      LIST: PATH_LIST,
      CREATE: PATH_CREATE, 
      CONNECT: PATH_CONNECT,
      STATUS: PATH_STATUS,
      QR: PATH_QR
    },
  };
}

export function resetDiscovery() {
  // Versão simples - não há cache para resetar
  return true;
}