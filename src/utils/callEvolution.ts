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
      { body: { action, ...payload } }
    );
    if (error) throw error;
    return data;
  } catch (e: any) {
    let details: any = null;
    if (e instanceof FunctionsHttpError) {
      try {
        details = await e.context.json();
      } catch {
        details = await e.context.text();
      }
      throw new Error(
        typeof details === "string" ? details : JSON.stringify(details)
      );
    }
    if (e instanceof FunctionsFetchError || e instanceof FunctionsRelayError) {
      throw new Error(e.message);
    }
    throw e;
  }
}
