// Autodetecta paths da Evolution API + fallbacks de payload e auth
type HM = "GET" | "POST";

export type EvoPaths = {
  LIST: string; CREATE: string; CONNECT: string; STATUS: string; QR: string;
};
type EvoCfg = {
  ok: boolean; base: string; key: string;
  authHeader?: string; authPrefix?: string; scheme: "apikey" | "bearer" | "custom";
};

const CANDIDATES = {
  LIST:    ["/instances", "/instance/list", "/v1/instances", "/evolution/instances", "/api/instances"],
  CREATE:  ["/instance/create", "/instances/create", "/v1/instance/create", "/instance", "/api/instance/create"],
  CONNECT: ["/instance/connect", "/instances/connect", "/v1/instance/connect", "/api/instance/connect"],
  STATUS:  ["/instance/status", "/instances/status", "/v1/instance/status", "/api/instance/status"],
  QR:      ["/instance/qr", "/instances/qr", "/v1/instance/qr", "/v1/qr", "/api/instance/qr"],
};

let DISCOVERED: EvoPaths | null = null;

function getCfg(): EvoCfg {
  const rawBase = (Deno.env.get("EVOLUTION_BASE_URL") || "").trim();
  const base = rawBase.replace(/\/+$/, "");
  const key  = (Deno.env.get("EVOLUTION_API_KEY") || "").trim();

  // Modos de auth:
  //  - EVOLUTION_AUTH_SCHEME: "apikey" (default) | "bearer" | "custom"
  //  - EVOLUTION_AUTH_HEADER: nome do header em "custom" (ex.: "X-Api-Key" ou "Authorization")
  //  - EVOLUTION_AUTH_PREFIX: prefixo opcional (ex.: "Bearer ")
  const scheme     = (Deno.env.get("EVOLUTION_AUTH_SCHEME") || "apikey").toLowerCase() as EvoCfg["scheme"];
  const authHeader = Deno.env.get("EVOLUTION_AUTH_HEADER") || undefined;
  const authPrefix = Deno.env.get("EVOLUTION_AUTH_PREFIX") || undefined;

  return { ok: !!base && !!key, base, key, authHeader, authPrefix, scheme };
}

function joinUrl(base: string, path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

function buildHeaders(cfg: EvoCfg): Record<string,string> {
  const h: Record<string,string> = { "Content-Type": "application/json" };
  if (cfg.scheme === "bearer") {
    h["Authorization"] = `${cfg.authPrefix || "Bearer "}${cfg.key}`;
  } else if (cfg.scheme === "custom" && cfg.authHeader) {
    h[cfg.authHeader] = `${cfg.authPrefix || ""}${cfg.key}`;
  } else {
    h["apikey"] = cfg.key; // default
  }
  return h;
}

async function fetchJson(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  let data: any = null;
  try { data = await res.json(); } catch {}
  return { res, ok: res.ok, status: res.status, data };
}

async function probePath(cfg: EvoCfg, path: string): Promise<{ok:boolean; status:number; data:any}> {
  // Alguns servidores aceitam GET para listar; outros, POST vazio.
  const headers = buildHeaders(cfg);
  // 1) GET
  let r = await fetchJson(joinUrl(cfg.base, path), { method: "GET", headers }).catch(() => null);
  if (r && r.ok) return r;
  // 2) POST (vazio)
  r = await fetchJson(joinUrl(cfg.base, path), { method: "POST", headers }).catch(() => null);
  return r || { ok:false, status:0, data:null };
}

function looksLikeListResponse(r: {ok:boolean; status:number; data:any}) {
  const d = r?.data;
  return r?.ok && (Array.isArray(d) || Array.isArray(d?.data) || Array.isArray(d?.instances) || Array.isArray(d?.result));
}

async function discoverPaths(): Promise<EvoPaths> {
  if (DISCOVERED) return DISCOVERED;
  const cfg = getCfg();
  if (!cfg.ok) throw new Error("EVOLUTION_CONFIG_MISSING");

  // Descobrir LIST primeiro
  let LIST = CANDIDATES.LIST[0];
  for (const p of CANDIDATES.LIST) {
    const r = await probePath(cfg, p);
    if (looksLikeListResponse(r)) { LIST = p; break; }
  }
  // Heurística simples pros demais (mantém candidatos mas prioriza o mesmo prefixo encontrado)
  const prefer = (arr: string[]) => {
    const basePrefix = LIST.split("/").slice(0,2).join("/") || "";
    const ordered = [...arr].sort((a,b) => (a.startsWith(basePrefix)?-1:1) - (b.startsWith(basePrefix)?-1:1));
    return ordered;
  };

  DISCOVERED = {
    LIST,
    CREATE:  prefer(CANDIDATES.CREATE)[0],
    CONNECT: prefer(CANDIDATES.CONNECT)[0],
    STATUS:  prefer(CANDIDATES.STATUS)[0],
    QR:      prefer(CANDIDATES.QR)[0],
  };
  return DISCOVERED;
}

async function evo(path: string, method: HM, body?: any) {
  const cfg = getCfg();
  if (!cfg.ok) {
    return {
      ok: false, status: 500, data: {
        code: "EVOLUTION_CONFIG_MISSING",
        error: "Set EVOLUTION_BASE_URL and EVOLUTION_API_KEY in Supabase Secrets.",
        details: { base_set: !!cfg.base, key_set: !!cfg.key }
      }
    };
  }
  const headers = buildHeaders(cfg);
  const url = joinUrl(cfg.base, path);
  return await fetchJson(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

// Fallbacks de payload para diferentes dialetos
const shapeCreate = (name: string, integration?: string) => ([
  { instanceName: name, integration, qrcode: true },
  { instance: name, integration, qrcode: true },
  { name, qrcode: true },
  { instanceName: name },
  { instance: name },
  { name }
]);

const shapeInstanceOnly = (name: string) => ([
  { instanceName: name },
  { instance: name },
  { name }
]);

export async function listInstances() {
  const paths = await discoverPaths();
  // Tenta GET, depois POST vazio
  const r1 = await evo(paths.LIST, "GET");
  if (r1.ok) return r1;
  const r2 = await evo(paths.LIST, "POST", {});
  return r2;
}

export async function createInstance(name: string, integration?: string) {
  const paths = await discoverPaths();
  for (const body of shapeCreate(name, integration)) {
    const r = await evo(paths.CREATE, "POST", body);
    if (r.ok || (r.status >= 200 && r.status < 300)) return r;
    // continua tentando próximo shape
  }
  return await evo(paths.CREATE, "POST", { instanceName: name, qrcode: true }); // último chute
}

export async function connectInstance(name: string) {
  const paths = await discoverPaths();
  for (const body of shapeInstanceOnly(name)) {
    const r = await evo(paths.CONNECT, "POST", body);
    if (r.ok) return r;
  }
  return await evo(paths.CONNECT, "POST", { instanceName: name });
}

export async function getStatus(name: string) {
  const paths = await discoverPaths();
  // Alguns servidores aceitam GET com query
  const tryGet = await (async () => {
    const cfg = getCfg(); if (!cfg.ok) return null;
    const headers = buildHeaders(cfg);
    const urlA = joinUrl(cfg.base, `${paths.STATUS}?instanceName=${encodeURIComponent(name)}`);
    const urlB = joinUrl(cfg.base, `${paths.STATUS}?instance=${encodeURIComponent(name)}`);
    const a = await fetchJson(urlA, { method: "GET", headers }).catch(()=>null);
    if (a?.ok) return a;
    const b = await fetchJson(urlB, { method: "GET", headers }).catch(()=>null);
    return b?.ok ? b : null;
  })();
  if (tryGet) return tryGet;
  for (const body of shapeInstanceOnly(name)) {
    const r = await evo(paths.STATUS, "POST", body);
    if (r.ok) return r;
  }
  return await evo(paths.STATUS, "POST", { instanceName: name });
}

export async function getQr(name: string) {
  const paths = await discoverPaths();
  for (const body of shapeInstanceOnly(name)) {
    const r = await evo(paths.QR, "POST", body);
    if (r.ok) return r;
  }
  return await evo(paths.QR, "POST", { instanceName: name });
}

export function normalizeQr(data: any): string | null {
  const pick = (v: any) => (typeof v === "string" && v.length > 50 ? v : null);
  const cands = [
    data?.base64, data?.qr_base64, data?.qr, data?.qrcode, data?.qrCode,
    data?.image?.base64, data?.data?.qr?.base64, data?.data?.qrcode
  ];
  for (const c of cands) {
    const hit = pick(c);
    if (hit) return hit.startsWith("data:") ? hit.split(",")[1] : hit;
  }
  return null;
}

export const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function ensureInstance(name: string, autoCreate = true) {
  const li = await listInstances().catch(() => null);
  if (li?.ok && Array.isArray(li.data)) {
    const hit = li.data.find((it: any) => it?.instanceName === name || it?.name === name || it?.id === name);
    if (hit) return { exists: true, created: false, data: hit };
  }
  const st = await getStatus(name).catch(() => null);
  if (st?.ok) return { exists: true, created: false, data: st.data };
  if (!autoCreate) return { exists: false, created: false };
  const cr = await createInstance(name);
  if (cr.ok || cr.status === 201 || cr.status === 409) return { exists: true, created: cr.status !== 409, data: cr.data };
  return { exists: false, created: false, error: cr.data };
}

export async function getDiscovered() {
  const cfg = getCfg();
  const paths = await discoverPaths().catch(() => null);
  return {
    env: {
      base_set: !!cfg.base, key_set: !!cfg.key,
      scheme: cfg.scheme, header: cfg.authHeader || (cfg.scheme === "bearer" ? "Authorization" : "apikey"),
      prefix: cfg.authPrefix || (cfg.scheme === "bearer" ? "Bearer " : ""),
      base: cfg.base,
    },
    paths,
  };
}