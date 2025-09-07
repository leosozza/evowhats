import { Transport, RequestSpec } from "./transport";
import { Result, ok, err } from "./result";

const withQuery = (url: string, q?: RequestSpec["query"]) => {
  if (!q) return url;
  const qs = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => v !== undefined && qs.set(k, String(v)));
  return `${url}?${qs.toString()}`;
};

export type FetchOpts = {
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  bearer?: string;
  logger?: (x: any) => void;
  retries?: number;
  backoffMs?: number;
};

export const createFetchTransport = (opts: FetchOpts = {}): Transport => {
  const { 
    baseUrl = "", 
    defaultHeaders = { "Content-Type": "application/json" }, 
    bearer, 
    logger, 
    retries = 1, 
    backoffMs = 350 
  } = opts;

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  const doFetch = async <T>(spec: RequestSpec): Promise<Result<T, Error>> => {
    const url = withQuery(baseUrl + spec.url, spec.query);
    const headers = { ...defaultHeaders, ...(spec.headers || {}) };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;

    const ctrl = new AbortController();
    const t = spec.timeoutMs ? setTimeout(() => ctrl.abort(), spec.timeoutMs) : null;

    try {
      const res = await fetch(url, {
        method: spec.method ?? "POST",
        headers,
        body: spec.body ? JSON.stringify(spec.body) : undefined,
        signal: ctrl.signal,
      });

      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : undefined;

      logger?.({ url, status: res.status, ok: res.ok, data });

      if (!res.ok) {
        return err(new Error(`HTTP ${res.status}: ${raw || res.statusText}`));
      }

      return ok(data as T);
    } catch (e: any) {
      logger?.({ error: e?.message || String(e) });
      return err(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (t) clearTimeout(t);
    }
  };

  return {
    async request<T>(spec) {
      let attempt = 0;
      while (true) {
        const r = await doFetch<T>(spec);
        if (r._tag === "Ok") return r;

        const retriable = attempt < retries && 
          /HTTP 5\d{2}|Failed to fetch|network|abort/i.test(r.error.message);

        if (!retriable) return r;

        attempt += 1;
        await sleep(backoffMs * attempt);
      }
    }
  };
};