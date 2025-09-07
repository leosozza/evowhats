import { Transport, RequestSpec } from "./transport";
import { ok, err } from "./result";

export type MockHandler = (spec: RequestSpec) => Promise<unknown> | unknown;

export const createMockTransport = (routes: Record<string, MockHandler>): Transport => ({
  async request<T>(spec) {
    const key = `${spec.method ?? "POST"} ${spec.url}`;
    const handler = routes[key] ?? 
      routes[`* ${spec.url}`] ?? 
      routes[key.replace(/\?.*$/, "")];

    if (!handler) {
      return err(new Error(`Mock route not found: ${key}`));
    }

    try {
      return ok(await handler(spec) as T);
    } catch (e: any) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }
});