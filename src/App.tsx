import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Index from "@/pages/Index";
import Dashboard from "@/components/Dashboard";
import Settings from "@/pages/Settings";
import BitrixIntegration from "@/pages/BitrixIntegration";
import BitrixCallback from "@/pages/BitrixCallback";
import BindingsDashboard from "@/pages/BindingsDashboard";
import EvolutionInstances from "@/pages/EvolutionInstances";
import EvolutionInstanceDetail from "@/pages/EvolutionInstanceDetail";
import Diagnostics from "@/pages/Diagnostics";
import { Wizard } from "@/features/onboarding/Wizard";
import AuthWrapper from "@/components/AuthWrapper";
import { Toaster } from "@/components/ui/toaster";

function App() {
  return (
    <Router>
      <AuthWrapper>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/wizard" element={<Wizard />} />
            <Route path="/diagnostics" element={<Diagnostics />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/bitrix" element={<BitrixIntegration />} />
            <Route path="/bitrix/callback" element={<BitrixCallback />} />
            <Route path="/bindings" element={<BindingsDashboard />} />
            <Route path="/evolution/instances" element={<EvolutionInstances />} />
            <Route path="/evolution/instances/:instanceName" element={<EvolutionInstanceDetail />} />
          </Routes>
        </div>
        <Toaster />
      </AuthWrapper>
    </Router>
  );
}

export default App;
