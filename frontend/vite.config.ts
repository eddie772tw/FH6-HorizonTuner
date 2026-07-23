import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

let gitCommit = "unknown";
let gitBranch = "unknown";

try {
  gitBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: ".." }).toString().trim();
  try {
    gitCommit = execSync("git describe --tags --exact-match HEAD", { stdio: 'pipe', cwd: ".." }).toString().trim();
  } catch (e) {
    gitCommit = execSync("git rev-parse --short HEAD", { cwd: ".." }).toString().trim();
  }
  
  try {
    const status = execSync("git status --porcelain -uno", { cwd: ".." }).toString().trim();
    if (status.length > 0) {
      const changedFiles = status.split("\n").map(line => line.trim());
      const hasRealChanges = changedFiles.some(line => {
        const filePath = line.substring(2).trim();
        return !filePath.endsWith("Cargo.lock") && 
               !filePath.endsWith("package-lock.json") && 
               !filePath.includes("logs/") && 
               !filePath.includes("__pycache__");
      });
      if (hasRealChanges) {
        gitCommit = "post-" + gitCommit;
      }
    }
  } catch (e) {
    // Ignore error checking status
  }
} catch (e) {
  console.warn("Could not retrieve git information.");
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  define: {
    __GIT_COMMIT__: JSON.stringify(gitCommit),
    __GIT_BRANCH__: JSON.stringify(gitBranch),
  },

  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("recharts") || id.includes("d3") || id.includes("victory")) {
              return "charts";
            }
            return "vendor";
          }
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
          clientPort: 1420,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
