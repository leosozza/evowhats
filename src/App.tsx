import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import BitrixCallback from "./pages/BitrixCallback";
import { Toaster } from "@/components/ui/toaster";
import ContactCenterLanding from "./pages/ContactCenterLanding";
import ConnectorSetup from "./pages/ConnectorSetup";

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background">
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/bitrix/callback" element={<BitrixCallback />} />
          <Route path="/cc/landing" element={<ContactCenterLanding />} />
          <Route path="/connector/setup" element={<ConnectorSetup />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Toaster />
      </div>
    </Router>
  );
}

export default App;
