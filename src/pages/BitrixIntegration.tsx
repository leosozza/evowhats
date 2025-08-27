
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ConnectBitrixButton from '@/components/bitrix/ConnectBitrixButton';
import BitrixConnectionMonitor from '@/components/bitrix/BitrixConnectionMonitor';
import BitrixSecretsConfig from '@/components/bitrix/BitrixSecretsConfig';
import BitrixOpenChannelsConfig from '@/components/bitrix/BitrixOpenChannelsConfig';
import BindEventsButton from '@/components/bitrix/BindEventsButton';
import SyncLeadsButton from '@/components/bitrix/SyncLeadsButton';
import { Settings, Zap, Users, Link } from 'lucide-react';

const BitrixIntegration = () => {
  const [portalUrl, setPortalUrl] = useState('');

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Link className="h-8 w-8" />
          Bitrix24 Integration
        </h1>
        <p className="text-muted-foreground mt-2">
          Connect and manage your Bitrix24 integration for seamless workflow automation
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Connection Status</CardTitle>
            <CardDescription>
              Monitor your Bitrix24 connection status and health
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BitrixConnectionMonitor />
          </CardContent>
        </Card>

        <Tabs defaultValue="setup" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="setup" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Setup
            </TabsTrigger>
            <TabsTrigger value="channels" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Channels
            </TabsTrigger>
            <TabsTrigger value="events" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Events
            </TabsTrigger>
            <TabsTrigger value="sync" className="flex items-center gap-2">
              <Link className="h-4 w-4" />
              Sync
            </TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Connection Setup</CardTitle>
                <CardDescription>
                  Connect your application to Bitrix24
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ConnectBitrixButton 
                  portalUrl={portalUrl}
                  onPortalUrlChange={setPortalUrl}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>API Configuration</CardTitle>
                <CardDescription>
                  Configure your Bitrix24 API secrets and credentials
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BitrixSecretsConfig />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="channels" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Open Channels Configuration</CardTitle>
                <CardDescription>
                  Manage your Bitrix24 Open Channels settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BitrixOpenChannelsConfig />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Event Binding</CardTitle>
                <CardDescription>
                  Configure event handlers and webhooks for Bitrix24 integration
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BindEventsButton />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sync" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Data Synchronization</CardTitle>
                <CardDescription>
                  Sync leads and other data between your application and Bitrix24
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SyncLeadsButton />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default BitrixIntegration;
