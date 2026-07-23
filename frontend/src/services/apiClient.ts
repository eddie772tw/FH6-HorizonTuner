import { invoke } from "@tauri-apps/api/core";

export const isTauriEnv = () => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
};

export const apiClient = {
  getCarDatabase: async () => {
    if (isTauriEnv()) {
      return await invoke("get_car_database");
    }
    return {};
  },

  getCarParams: async (carId: string) => {
    if (isTauriEnv()) {
      return await invoke("get_car_params", { carId });
    }
    return null;
  },

  saveCarParams: async (carId: string, params: any) => {
    if (isTauriEnv()) {
      return await invoke("save_car_params", { carId, params });
    }
  },

  deleteDynoCurve: async (carId: string) => {
    if (isTauriEnv()) {
      return await invoke("delete_dyno_curve", { carId });
    }
  },

  getSettings: async () => {
    if (isTauriEnv()) {
      return await invoke("get_settings");
    }
    return {};
  },

  saveSettings: async (settings: any) => {
    if (isTauriEnv()) {
      return await invoke("save_settings", { settings });
    }
  },

  getTunings: async () => {
    if (isTauriEnv()) {
      return (await invoke("get_tunings")) as string[];
    }
    return [];
  },

  getTuningRecord: async (carId: string, saveName: string) => {
    if (isTauriEnv()) {
      return await invoke("get_tuning_record", { carId, saveName });
    }
    return null;
  },

  saveTuningRecord: async (carId: string, saveName: string, data: any) => {
    if (isTauriEnv()) {
      return await invoke("save_tuning_record", { carId, saveName, data });
    }
  },

  getAnalysisSessions: async () => {
    if (isTauriEnv()) {
      return (await invoke("get_analysis_sessions")) as string[];
    }
    return [];
  },

  getAnalysisSession: async (filename: string) => {
    if (isTauriEnv()) {
      return await invoke("get_analysis_session", { filename });
    }
    return null;
  },

  saveAnalysisSession: async (filename: string, data: any) => {
    if (isTauriEnv()) {
      return await invoke("save_analysis_session", { filename, data });
    }
  },

  deleteAnalysisSession: async (filename: string) => {
    if (isTauriEnv()) {
      return await invoke("delete_analysis_session", { filename });
    }
  },

  getDragSessions: async () => {
    if (isTauriEnv()) {
      return (await invoke("get_drag_sessions")) as string[];
    }
    return [];
  },

  getDragSession: async (filename: string) => {
    if (isTauriEnv()) {
      return await invoke("get_drag_session", { filename });
    }
    return null;
  },

  saveDragSession: async (filename: string, data: any) => {
    if (isTauriEnv()) {
      return await invoke("save_drag_session", { filename, data });
    }
  },

  deleteDragSession: async (filename: string) => {
    if (isTauriEnv()) {
      return await invoke("delete_drag_session", { filename });
    }
  },

  getOverlayConfig: async () => {
    if (isTauriEnv()) {
      return await invoke("get_overlay_config");
    }
    return {};
  },

  saveOverlayConfig: async (config: any) => {
    if (isTauriEnv()) {
      return await invoke("save_overlay_config", { config });
    }
  },

  getOverlayLayout: async () => {
    if (isTauriEnv()) {
      return await invoke("get_overlay_layout");
    }
    return {};
  },

  saveOverlayLayout: async (layout: any) => {
    if (isTauriEnv()) {
      return await invoke("save_overlay_layout", { layout });
    }
  },
};
