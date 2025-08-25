
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useBitrixTokenRefresh } from "@/hooks/useBitrixTokenRefresh";
import Index from "@/pages/Index";
import ContactCenterLanding from "@/pages/ContactCenterLanding";
import ConnectorSetup from "@/pages/ConnectorSetup";
import BitrixCallback from "@/pages/BitrixCallback";
import BindingsDashboard from "@/pages/BindingsDashboard";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const { session } = useSupabaseAuth();
  useBitrixTokenRefresh();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/contact-center" element={<ContactCenterLanding />} />
            <Route path="/connector" element={<ConnectorSetup />} />
            <Route path="/bitrix-callback" element={<BitrixCallback />} />
            <Route path="/bitrix/callback" element={<BitrixCallback />} />
            <Route path="/bindings" element={<BindingsDashboard />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
