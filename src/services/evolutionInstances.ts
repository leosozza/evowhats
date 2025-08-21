
import { supabase } from "@/integrations/supabase/client";

export interface EvolutionInstance {
  instanceName: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'qr_ready';
  qrCode?: string;
  owner?: string;
  profileName?: string;
  profilePictureUrl?: string;
  connectedAt?: string;
  lastActivity?: string;
}

export interface InstanceConnection {
  instanceName: string;
  socket?: WebSocket;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
}

class EvolutionInstanceManager {
  private instances: Map<string, EvolutionInstance> = new Map();
  private connections: Map<string, InstanceConnection> = new Map();
  private listeners: ((instances: EvolutionInstance[]) => void)[] = [];

  constructor() {
    this.loadInstances();
  }

  private async loadInstances() {
    try {
      const response = await supabase.functions.invoke('evolution-connector', {
        body: { action: 'get_all_instances' }
      });

      if (response.data?.ok) {
        const instancesData = response.data.data?.instances || [];
        instancesData.forEach((inst: any) => {
          this.instances.set(inst.instanceName, {
            instanceName: inst.instanceName,
            status: this.mapStatus(inst.status),
            owner: inst.owner,
            profileName: inst.profileName
          });
        });
        this.notifyListeners();
      }
    } catch (error) {
      console.error('Error loading instances:', error);
    }
  }

  private mapStatus(evolutionStatus: string): EvolutionInstance['status'] {
    switch (evolutionStatus?.toLowerCase()) {
      case 'open':
      case 'connected':
        return 'connected';
      case 'connecting':
        return 'connecting';
      case 'close':
      case 'closed':
      case 'disconnected':
        return 'disconnected';
      default:
        return 'disconnected';
    }
  }

  async createInstance(instanceName: string): Promise<boolean> {
    try {
      const response = await supabase.functions.invoke('evolution-connector', {
        body: {
          action: 'proxy',
          path: '/instance/create',
          method: 'POST',
          payload: { instanceName }
        }
      });

      if (response.data?.ok) {
        const newInstance: EvolutionInstance = {
          instanceName,
          status: 'disconnected'
        };
        this.instances.set(instanceName, newInstance);
        this.notifyListeners();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error creating instance:', error);
      return false;
    }
  }

  async connectInstance(instanceName: string): Promise<string | null> {
    try {
      // Start the connection process
      await supabase.functions.invoke('evolution-connector', {
        body: {
          action: 'proxy',
          path: `/instance/connect/${instanceName}`,
          method: 'GET'
        }
      });

      // Get QR code
      const qrResponse = await supabase.functions.invoke('evolution-connector', {
        body: {
          action: 'proxy',
          path: `/instance/qrcode/${instanceName}`,
          method: 'GET'
        }
      });

      if (qrResponse.data?.ok) {
        const qrCode = qrResponse.data.data?.base64 || qrResponse.data.data?.qrcode;
        
        const instance = this.instances.get(instanceName);
        if (instance) {
          instance.status = 'qr_ready';
          instance.qrCode = qrCode;
          this.instances.set(instanceName, instance);
          this.notifyListeners();
          
          // Start WebSocket connection for real-time updates
          this.connectWebSocket(instanceName);
          
          return qrCode;
        }
      }
      return null;
    } catch (error) {
      console.error('Error connecting instance:', error);
      return null;
    }
  }

  private connectWebSocket(instanceName: string) {
    // Get Evolution API config
    const getConfig = async () => {
      const { data: config } = await supabase
        .from("user_configurations")
        .select("evolution_base_url, evolution_api_key")
        .maybeSingle();
      
      if (!config?.evolution_base_url) return;

      const wsUrl = config.evolution_base_url
        .replace('http://', 'ws://')
        .replace('https://', 'wss://') + `/${instanceName}`;

      const socket = new WebSocket(wsUrl);
      
      socket.onopen = () => {
        console.log(`WebSocket connected for instance: ${instanceName}`);
        
        // Send authentication if needed
        socket.send(JSON.stringify({
          apikey: config.evolution_api_key
        }));
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleWebSocketEvent(instanceName, data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      socket.onclose = () => {
        console.log(`WebSocket disconnected for instance: ${instanceName}`);
        // Try to reconnect after delay
        setTimeout(() => {
          const connection = this.connections.get(instanceName);
          if (connection && connection.reconnectAttempts < connection.maxReconnectAttempts) {
            connection.reconnectAttempts++;
            this.connectWebSocket(instanceName);
          }
        }, 5000);
      };

      socket.onerror = (error) => {
        console.error(`WebSocket error for ${instanceName}:`, error);
      };

      // Store connection
      this.connections.set(instanceName, {
        instanceName,
        socket,
        reconnectAttempts: 0,
        maxReconnectAttempts: 5
      });
    };

    getConfig();
  }

  private handleWebSocketEvent(instanceName: string, data: any) {
    const instance = this.instances.get(instanceName);
    if (!instance) return;

    console.log(`WebSocket event for ${instanceName}:`, data);

    switch (data.event) {
      case 'CONNECTION_UPDATE':
        instance.status = this.mapStatus(data.state || data.status);
        if (instance.status === 'connected') {
          instance.connectedAt = new Date().toISOString();
          instance.owner = data.owner;
          // Clear QR code when connected
          delete instance.qrCode;
        }
        break;

      case 'QRCODE_UPDATED':
        instance.qrCode = data.qrcode || data.base64;
        instance.status = 'qr_ready';
        break;

      case 'MESSAGES_UPSERT':
        // Handle incoming messages - will be used for real message monitoring
        this.handleIncomingMessage(instanceName, data);
        break;
    }

    this.instances.set(instanceName, instance);
    this.notifyListeners();
  }

  private handleIncomingMessage(instanceName: string, messageData: any) {
    // This will be expanded to save messages to Supabase
    console.log(`New message for ${instanceName}:`, messageData);
    
    // TODO: Save to conversations/messages tables
    // TODO: Trigger real-time updates for connected clients
  }

  async deleteInstance(instanceName: string): Promise<boolean> {
    try {
      const response = await supabase.functions.invoke('evolution-connector', {
        body: {
          action: 'proxy',
          path: `/instance/delete/${instanceName}`,
          method: 'DELETE'
        }
      });

      if (response.data?.ok) {
        this.instances.delete(instanceName);
        
        // Close WebSocket connection
        const connection = this.connections.get(instanceName);
        if (connection?.socket) {
          connection.socket.close();
        }
        this.connections.delete(instanceName);
        
        this.notifyListeners();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting instance:', error);
      return false;
    }
  }

  getInstances(): EvolutionInstance[] {
    return Array.from(this.instances.values());
  }

  getInstance(instanceName: string): EvolutionInstance | undefined {
    return this.instances.get(instanceName);
  }

  subscribe(callback: (instances: EvolutionInstance[]) => void) {
    this.listeners.push(callback);
    // Immediately call with current data
    callback(this.getInstances());
    
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notifyListeners() {
    const instances = this.getInstances();
    this.listeners.forEach(callback => callback(instances));
  }

  async linkInstanceToChannel(instanceName: string, channelId: string): Promise<boolean> {
    try {
      // Save the linkage in Supabase
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from('wa_sessions')
        .upsert({
          user_id: user.id,
          bitrix_line_id: channelId,
          evo_instance_id: instanceName,
          status: 'CONNECTED'
        });

      return !error;
    } catch (error) {
      console.error('Error linking instance to channel:', error);
      return false;
    }
  }
}

// Singleton instance
export const evolutionInstanceManager = new EvolutionInstanceManager();
