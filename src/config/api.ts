import { ENV } from "@/config/env";

export const API_CONFIG = {
  mode: ENV.API_MODE,
  baseUrl: ENV.FUNCTIONS_BASE_URL, // termina com /functions/v1
  bearer: undefined,
} as const;