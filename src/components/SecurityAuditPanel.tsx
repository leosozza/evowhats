import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Eye, Shield, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface AuditLog {
  id: string;
  action: string;
  timestamp: string;
  details: any;
  ip_address?: string | null;
  user_agent?: string | null;
  credential_id: string;
  user_id: string;
}

interface Credential {
  id: string;
  portal_url: string;
  client_id: string;
  is_active: boolean;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

export function SecurityAuditPanel() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load audit logs
      const { data: logs, error: logsError } = await supabase
        .from('bitrix_credentials_audit')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(50);

      if (logsError) throw logsError;

      // Load safe credentials (without sensitive tokens)
      const { data: creds, error: credsError } = await supabase
        .rpc('get_bitrix_credentials_safe');

      if (credsError) throw credsError;

      setAuditLogs((logs || []).map((log: any) => ({
        ...log,
        ip_address: log.ip_address as string | null,
        user_agent: log.user_agent as string | null
      })));
      setCredentials((creds as any) || []);
    } catch (error: any) {
      console.error('Error loading security data:', error);
      toast({
        title: "Error",
        description: "Failed to load security audit data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const revokeCredential = async (credentialId: string) => {
    try {
      const { data, error } = await supabase
        .rpc('revoke_bitrix_credentials', { credential_id: credentialId });

      if (error) throw error;

      if (data) {
        toast({
          title: "Success",
          description: "Credential revoked successfully"
        });
        loadData(); // Reload data
      } else {
        toast({
          title: "Error",
          description: "Failed to revoke credential",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Error revoking credential:', error);
      toast({
        title: "Error",
        description: "Failed to revoke credential",
        variant: "destructive"
      });
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'INSERT': return 'bg-green-100 text-green-800';
      case 'UPDATE': return 'bg-yellow-100 text-yellow-800';
      case 'DELETE': return 'bg-red-100 text-red-800';
      case 'SELECT': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Audit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active Credentials */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Active Bitrix Credentials
          </CardTitle>
          <CardDescription>
            Monitor and manage your active Bitrix24 integrations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {credentials.length === 0 ? (
            <p className="text-muted-foreground">No active credentials found</p>
          ) : (
            <div className="space-y-4">
              {credentials.map((cred) => (
                <div key={cred.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <p className="font-medium">{cred.portal_url}</p>
                    <p className="text-sm text-muted-foreground">Client ID: {cred.client_id}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant={cred.is_active ? "default" : "secondary"}>
                        {cred.is_active ? "Active" : "Inactive"}
                      </Badge>
                      {cred.expires_at && (
                        <Badge variant="outline">
                          Expires: {format(new Date(cred.expires_at), 'MMM dd, yyyy')}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => revokeCredential(cred.id)}
                    className="flex items-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Recent Activity
          </CardTitle>
          <CardDescription>
            Last 50 access events for your Bitrix credentials
          </CardDescription>
        </CardHeader>
        <CardContent>
          {auditLogs.length === 0 ? (
            <p className="text-muted-foreground">No audit logs found</p>
          ) : (
            <div className="space-y-2">
              {auditLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center gap-3">
                    <Badge className={getActionColor(log.action)}>
                      {log.action}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">
                        {log.details?.portal_url || 'Unknown portal'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(log.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {log.ip_address && <p>IP: {log.ip_address}</p>}
                    {log.details?.token_updated && (
                      <div className="flex items-center gap-1 text-yellow-600">
                        <AlertTriangle className="h-3 w-3" />
                        Token Updated
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}