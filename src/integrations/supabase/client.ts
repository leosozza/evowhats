import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { ENV } from '@/config/env';

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(
  ENV.SUPABASE_URL,
  ENV.SUPABASE_PUBLISHABLE_KEY,
  {
    auth: { storage: localStorage, persistSession: true, autoRefreshToken: true },
  }
);