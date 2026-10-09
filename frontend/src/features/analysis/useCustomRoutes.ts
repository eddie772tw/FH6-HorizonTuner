import { useState, useEffect, useCallback } from "react";
import { backendFetch } from "../../services/backend";
import { useFileSave } from "../../hooks/useFileSave";
import type { CustomRoute } from "./routeTriggerMath";

export function useCustomRoutes() {
  const [routes, setRoutes] = useState<CustomRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const { save } = useFileSave();

  const fetchRoutes = useCallback(async () => {
    try {
      const res = await backendFetch("/api/analysis/routes");
      const data = await res.json();
      if (Array.isArray(data)) {
        setRoutes(data);
      }
    } catch (e) {
      console.error("Failed to fetch routes:", e);
    }
  }, []);

  useEffect(() => {
    void fetchRoutes();
  }, [fetchRoutes]);

  const saveRoute = useCallback(async (route: Partial<CustomRoute>): Promise<boolean> => {
    try {
      const res = await backendFetch("/api/analysis/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(route),
      });
      const data = await res.json();
      if (data && data.success) {
        await fetchRoutes();
        if (data.route?.route_id) {
          setSelectedRouteId(data.route.route_id);
        }
        return true;
      }
    } catch (e) {
      console.error("Failed to save route:", e);
    }
    return false;
  }, [fetchRoutes]);

  const deleteRoute = useCallback(async (routeId: string): Promise<boolean> => {
    try {
      const res = await backendFetch(`/api/analysis/routes/${encodeURIComponent(routeId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data && data.success) {
        await fetchRoutes();
        setSelectedRouteId((curr) => (curr === routeId ? null : curr));
        return true;
      }
    } catch (e) {
      console.error("Failed to delete route:", e);
    }
    return false;
  }, [fetchRoutes]);

  const importRoutes = useCallback(async (file: File): Promise<void> => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await backendFetch("/api/analysis/routes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (data && data.success) {
        await fetchRoutes();
      }
    } catch (e) {
      console.error("Failed to import routes:", e);
    }
  }, [fetchRoutes]);

  const exportRoute = useCallback((routeId: string) => {
    const route = routes.find((r) => r.route_id === routeId);
    if (!route) return;
    const jsonStr = JSON.stringify({ schema: "fh6-custom-route/v1", route }, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    void save({
      filename: `${route.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_route.json`,
      mimeType: "application/json",
      load: () => Promise.resolve(blob),
    });
  }, [routes, save]);

  return {
    routes,
    selectedRouteId,
    setSelectedRouteId,
    fetchRoutes,
    saveRoute,
    deleteRoute,
    importRoutes,
    exportRoute,
  };
}
