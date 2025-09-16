-- Fix security warnings for bitrix_credentials functions
-- This migration addresses search_path security issues

-- Fix search_path for security definer functions to prevent SQL injection
ALTER FUNCTION public.get_active_bitrix_credentials() SET search_path = 'public';
ALTER FUNCTION public.revoke_bitrix_credentials(UUID) SET search_path = 'public';  
ALTER FUNCTION public.get_bitrix_credentials_safe() SET search_path = 'public';
ALTER FUNCTION public.audit_bitrix_credentials() SET search_path = 'public';