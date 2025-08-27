
import { useState, useEffect } from "react";

export interface DashboardStats {
  activeConnections: number;
  evolutionInstances: number;
  bindings: number;
  importedLeads: number;
  sentMessages: number;
}

export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats>({
    activeConnections: 0,
    evolutionInstances: 0,
    bindings: 0,
    importedLeads: 0,
    sentMessages: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading stats - in a real app this would fetch from API
    const loadStats = async () => {
      setLoading(true);
      try {
        // Placeholder stats - replace with actual API calls when backend is ready
        setStats({
          activeConnections: 3,
          evolutionInstances: 2,
          bindings: 4,
          importedLeads: 125,
          sentMessages: 1847,
        });
      } catch (error) {
        console.error("Error loading dashboard stats:", error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  return { stats, loading };
}
