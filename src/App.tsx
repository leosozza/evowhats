import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Dashboard from "@/components/Dashboard";
import Settings from "@/pages/Settings";
import BitrixIntegration from "@/pages/BitrixIntegration";
import BindingsDashboard from "@/pages/BindingsDashboard";
import EvolutionInstances from "@/pages/EvolutionInstances";
import EvolutionInstanceDetail from "@/pages/EvolutionInstanceDetail";

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/bitrix" element={<BitrixIntegration />} />
          <Route path="/bindings" element={<BindingsDashboard />} />
          <Route path="/evolution/instances" element={<EvolutionInstances />} />
          <Route path="/evolution/instances/:instanceName" element={<EvolutionInstanceDetail />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
