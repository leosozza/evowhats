import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { ENV } from '@/config/env';

const SUPABASE_URL = ENV.SUPABASE_URL;
const SUPABASE_ANON_KEY = ENV.SUPABASE_PUBLISHABLE_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: { storage: localStorage, persistSession: true, autoRefreshToken: true },
  }
);