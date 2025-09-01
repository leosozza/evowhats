
import { supabase } from "@/integrations/supabase/client";
import { io, Socket } from "socket.io-client";

export interface EvolutionInstance {
  instanceName: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'qr_ready';
  qrCode?: string | null;
  owner?: string | null;
  profileName?: string | null;
  profilePictureUrl?: string | null;
  connectedAt?: string | null;
  lastActivity?: string | null;
}

interface InstanceConnection {
  instanceName: string;
  socket?: Socket;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
}

interface EvolutionConfig {
  evolution_base_url?: string | null;
  evolution_api_key?: string | null;
}

class EvolutionInstanceManager {
  private instances = new Map<string, EvolutionInstance>();
  private connections = new Map<string, InstanceConnection>();
  private listeners: Array<(list: EvolutionInstance[]) => void> = [];

  constructor() { this.bootstrap(); }

  private async bootstrap() {
    // opcional: buscar instâncias existentes do seu backend
    this.notify();
  }

  private mapStatus(s?: string): EvolutionInstance['status'] {
    const st = String(s || '').toLowerCase();
    if (st === 'open' || st === 'connected') return 'connected';
    if (st === 'connecting') return 'connecting';
    if (st === 'qr' || st === 'qr_ready') return 'qr_ready';
    return 'disconnected';
  }

  subscribe(cb: (list: EvolutionInstance[]) => void) {
    this.listeners.push(cb);
    cb(this.getList());
    return () => { this.listeners = this.listeners.filter(x => x !== cb); };
  }
  private notify() { const list = this.getList(); this.listeners.forEach(cb => cb(list)); }
  private getList() { return [...this.instances.values()].sort((a,b)=>a.instanceName.localeCompare(b.instanceName)); }

  // === API REST Evolution via sua edge function ===
  private async evo(action: string, path: string, method = "GET", payload?: any) {
    const { data, error } = await supabase.functions.invoke('evolution-connector-v2', {
      body: { action, path, method, payload }
    });
    if (error) throw error;
    return data;
  }

  async createInstance(instanceName: string) {
    const r = await this.evo('proxy', '/instance/create', 'POST', { instanceName, qrcode: true });
    if (r?.ok) {
      this.instances.set(instanceName, { instanceName, status: 'disconnected' });
      this.notify();
      return true;
    }
    return false;
  }

  async connectInstance(instanceName: string) {
    // tenta v1 (connect) e v2 (create com qrcode true) de forma resiliente
    const inst = this.instances.get(instanceName) || { instanceName, status: 'disconnected' as const };
    this.instances.set(instanceName, { ...inst, status: 'connecting' });
    this.notify();

    // v1: dispara conexão (que gera QR)
    await this.evo('proxy', `/instance/connect/${encodeURIComponent(instanceName)}`, 'GET').catch(()=>{});
    // v2 fallback: já solicitamos qrcode no create, então só segue

    // tenta obter QR (se sua versão suportar endpoint qrcode); se 404, o WS entregará via QRCODE_UPDATED
    const qrTry = await this.evo('proxy', `/instance/qrcode/${encodeURIComponent(instanceName)}`, 'GET').catch(()=>null);
    const base64 = qrTry?.ok ? (qrTry.data?.base64 || qrTry.data?.qrcode) : null;

    this.attachSocket(instanceName);

    if (base64) {
      this.instances.set(instanceName, { ...inst, status: 'qr_ready', qrCode: base64 });
      this.notify();
    }
    return base64;
  }

  private async getConfig(): Promise<EvolutionConfig> {
    const { data } = await supabase
      .from("user_configurations")
      .select("evolution_base_url, evolution_api_key")
      .maybeSingle();
    return data || {};
  }

  private async attachSocket(instanceName: string) {
    if (this.connections.has(instanceName)) return;

    const cfg = await this.getConfig();
    if (!cfg?.evolution_base_url) return;

    const wsUrl = cfg.evolution_base_url.replace(/^http/, 'ws') + `/${encodeURIComponent(instanceName)}`;
    const socket: Socket = io(wsUrl, {
      transports: ['websocket'],
      auth: cfg.evolution_api_key ? { apikey: cfg.evolution_api_key } : undefined,
    });

    const conn: InstanceConnection = { instanceName, socket, reconnectAttempts: 0, maxReconnectAttempts: 8 };
    this.connections.set(instanceName, conn);

    socket.on('connect', () => {
      console.log(`[EvolutionManager] Socket connected for ${instanceName}`);
    });
    
    socket.on('disconnect', () => {
      console.log(`[EvolutionManager] Socket disconnected for ${instanceName}`);
      // tenta reconectar com backoff simples
      setTimeout(() => {
        const c = this.connections.get(instanceName);
        if (!c) return;
        if (c.reconnectAttempts < c.maxReconnectAttempts) {
          c.reconnectAttempts++;
          socket.connect();
        }
      }, 3000);
    });

    socket.on('QRCODE_UPDATED', (p: any) => {
      console.log(`[EvolutionManager] QR updated for ${instanceName}:`, p);
      const inst = this.instances.get(instanceName) || { instanceName, status: 'disconnected' as const };
      const qr = p?.qrcode || p?.base64 || null;
      this.instances.set(instanceName, { ...inst, status: 'qr_ready', qrCode: qr });
      this.notify();
    });

    socket.on('CONNECTION_UPDATE', (p: any) => {
      console.log(`[EvolutionManager] Connection update for ${instanceName}:`, p);
      const inst = this.instances.get(instanceName) || { instanceName, status: 'disconnected' as const };
      const mapped = this.mapStatus(p?.state || p?.status);
      this.instances.set(instanceName, {
        ...inst,
        status: mapped,
        qrCode: mapped === 'connected' ? null : inst.qrCode,
        connectedAt: mapped === 'connected' ? new Date().toISOString() : inst.connectedAt,
        owner: p?.owner || inst.owner || null
      });
      this.notify();
    });

    socket.on('MESSAGES_UPSERT', async (payload: any) => {
      console.log(`[EvolutionManager] Messages received for ${instanceName}:`, payload);
      // dica: delegue para seu hook useEvolutionRealTime tratar persistência
      // ou dispare um evento/window.dispatchEvent para o hook ouvir
      window.dispatchEvent(new CustomEvent('EVO_MESSAGES_UPSERT', { detail: { instanceName, payload } }));
    });
  }

  async deleteInstance(instanceName: string) {
    await this.evo('proxy', `/instance/delete/${encodeURIComponent(instanceName)}`, 'DELETE').catch(()=>{});
    const c = this.connections.get(instanceName);
    try { c?.socket?.disconnect(); } catch {}
    this.connections.delete(instanceName);
    this.instances.delete(instanceName);
    this.notify();
    return true;
  }

  async linkInstanceToChannel(instanceName: string, lineId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { error } = await supabase.from('wa_sessions').upsert({
      user_id: user.id,
      bitrix_line_id: lineId,
      evo_instance_id: instanceName,
      status: 'CONNECTED',
      updated_at: new Date().toISOString()
    });
    return !error;
  }

  getInstances() { return this.getList(); }
  getInstance(name: string) { return this.instances.get(name); }
}

export const evolutionInstanceManager = new EvolutionInstanceManager();
