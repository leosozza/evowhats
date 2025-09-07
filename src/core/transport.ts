import type { Result } from "./result";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RequestSpec = {
  url: string;
  method?: HttpMethod;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  timeoutMs?: number;
};

export type Transport = {
  request<T = unknown>(spec: RequestSpec): Promise<Result<T, Error>>;
};