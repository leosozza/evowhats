import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { ENV } from '@/config/env';

const SUPABASE_URL = ENV.SUPABASE_URL;
const SUPABASE_ANON_KEY = ENV.SUPABASE_PUBLISHABLE_KEY;
const FUNCTIONS_URL =
  (import.meta.env.VITE_FUNCTIONS_BASE_URL || "").replace(/\/+$/, "") ||
  `${SUPABASE_URL.replace(".supabase.co", ".functions.supabase.co")}/functions/v1`;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: { storage: localStorage, persistSession: true, autoRefreshToken: true },
    // 👇 força o invoke a usar o domínio correto (sem CORS)
    functions: { url: FUNCTIONS_URL },
  }
);