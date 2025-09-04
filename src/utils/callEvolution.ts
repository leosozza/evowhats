import { supabase } from "@/integrations/supabase/client";
import {
  FunctionsHttpError,
  FunctionsFetchError,
  FunctionsRelayError,
} from "@supabase/supabase-js";

export async function callEvolution(action: string, payload: any = {}) {
  try {
    const { data, error } = await supabase.functions.invoke(
      "evolution-connector-v2",
      { body: { action, ...payload }, headers: { "Content-Type": "application/json" } }
    );
    if (error) throw error;
    return data;
  } catch (e: any) {
    if (e instanceof FunctionsHttpError) {
      try { 
        const det = await e.context.json(); 
        throw new Error(JSON.stringify(det)); 
      } catch { 
        const det = await e.context.text(); 
        throw new Error(det); 
      }
    }
    if (e instanceof FunctionsFetchError || e instanceof FunctionsRelayError) {
      throw new Error(e.message);
    }
    throw e;
  }
}
