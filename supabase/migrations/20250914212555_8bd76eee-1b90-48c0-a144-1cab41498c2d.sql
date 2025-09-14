-- Corrigir a última função com search_path inseguro
CREATE OR REPLACE FUNCTION public.cleanup_expired_oauth_states()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  DELETE FROM oauth_states WHERE expires_at < now();
END;
$function$;