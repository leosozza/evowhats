import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Routes, Route } from "react-router-dom"

import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"

import { Index } from "@/pages"
import { ContactCenterLanding } from "@/pages/contact-center"
import { ConnectorSetup } from "@/pages/connector-setup"
import { BitrixCallback } from "@/pages/callback"
import { NotFound } from "@/pages/not-found"

import { Header } from "@/components/Header"

const queryClient = new QueryClient()

import BindingsDashboard from "@/pages/BindingsDashboard";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-background">
            <Header />
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/contact-center" element={<ContactCenterLanding />} />
                <Route path="/connector-setup" element={<ConnectorSetup />} />
                <Route path="/callback" element={<BitrixCallback />} />
                <Route path="/bindings" element={<BindingsDashboard />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
            <Toaster />
          </div>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
