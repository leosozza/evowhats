import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const BitrixCallback = () => {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const domain = searchParams.get('domain');

      const savedState = localStorage.getItem('bx_oauth_state');
      
      if (!code || !state || state !== savedState) {
        window.opener?.postMessage({ 
          source: 'bitrix-oauth', 
          ok: false, 
          reason: 'State inválido ou código ausente' 
        }, '*');
        window.close();
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('bitrix-oauth-exchange', {
          body: { code, state, domain }
        });

        if (error || !data?.ok) {
          throw new Error(data?.error || 'Falha na troca de token');
        }

        localStorage.removeItem('bx_oauth_state');
        
        window.opener?.postMessage({ 
          source: 'bitrix-oauth', 
          ok: true 
        }, '*');
        
        window.close();
      } catch (error: any) {
        window.opener?.postMessage({ 
          source: 'bitrix-oauth', 
          ok: false, 
          reason: error.message 
        }, '*');
        window.close();
      }
    };

    handleCallback();
  }, [searchParams]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
        <p className="mt-4">Processando autenticação...</p>
      </div>
    </div>
  );
};

export default BitrixCallback;