import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// In dev mode, the Python backend sidecar may not be running.
// Serve hud_overlay/ files directly for /hud/* requests instead of proxying.
const HUD_OVERLAY_DIR = path.resolve(__dirname, "../hud_overlay");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".otf": "font/otf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".webp": "image/webp",
};

function hudStaticPlugin(): Plugin {
  return {
    name: "hud-static-serve",
    configureServer(server) {
      // Register before internal middlewares so /hud/* is intercepted early
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith("/hud/")) return next();

        // Strip /hud/ prefix and decode URI, then map to hud_overlay/
        const relativePath = decodeURIComponent(req.url.slice("/hud/".length).split("?")[0]);
        const filePath = path.join(HUD_OVERLAY_DIR, relativePath);

        // Security: prevent directory traversal
        if (!filePath.startsWith(HUD_OVERLAY_DIR)) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }

        try {
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            // Serve index.html for directory requests
            const indexPath = path.join(filePath, "index.html");
            if (fs.existsSync(indexPath)) {
              res.setHeader("Content-Type", "text/html; charset=utf-8");
              res.end(fs.readFileSync(indexPath));
              return;
            }
            res.statusCode = 404;
            res.end("Not Found");
            return;
          }
          const ext = path.extname(filePath).toLowerCase();
          const mime = MIME_TYPES[ext] || "application/octet-stream";
          const charset = [".html", ".css", ".js", ".json", ".svg"].includes(ext) ? "; charset=utf-8" : "";
          res.setHeader("Content-Type", mime + charset);
          res.setHeader("Cache-Control", "no-cache");
          res.end(fs.readFileSync(filePath));
        } catch {
          res.statusCode = 404;
          res.end("Not Found");
        }
      });
    },
  };
}

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

import pkg from "./package.json";

let rawCommit = process.env.VITE_GIT_COMMIT || process.env.RELEASE_TAG || "unknown";
let gitBranch = process.env.VITE_GIT_BRANCH || "unknown";
let releaseTag: string | null = null;
let isDirty = false;
const isReleaseBuild = Boolean(process.env.VITE_GIT_COMMIT || process.env.RELEASE_TAG);

const generatedPathPrefixes = [
  "dist/",
  "build/",
  "metrics/",
  "scratch/",
  "diagnostics_output/",
  "frontend/dist/",
  "frontend/src-tauri/bin/",
  "frontend/src-tauri/gen/",
  "frontend/src-tauri/target/",
  "logs/",
  ".pytest_cache/",
  ".ruff_cache/",
  ".coverage",
  "__pycache__/",
];

function isGeneratedPath(filePath: string): boolean {
  const normalizedPath = filePath.replaceAll("\\", "/").replace(/^\.\//, "");
  return generatedPathPrefixes.some(
    (prefix) => normalizedPath === prefix.slice(0, -1) || normalizedPath.startsWith(prefix),
  );
}

// Only perform local git CLI detection if not explicitly supplied by CI Release Environment
if (!isReleaseBuild) {
  try {
    gitBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: ".." }).toString().trim();
    try {
      releaseTag = execSync("git describe --tags --exact-match HEAD", { stdio: "pipe", cwd: ".." }).toString().trim();
    } catch {
      releaseTag = null;
    }
    
    try {
      rawCommit = execSync("git rev-parse --short HEAD", { cwd: ".." }).toString().trim();
    } catch {
      rawCommit = "unknown";
    }

    try {
      const status = execSync("git status --porcelain=v1 --untracked-files=all", { cwd: ".." }).toString().trim();
      if (status.length > 0) {
        const changedFiles = status.split("\n").map(line => line.trim());
        isDirty = changedFiles.some(line => {
          let filePath = line.substring(3).trim();
          if (line.startsWith("R") || line.startsWith("C")) {
            filePath = filePath.split(" -> ").pop() || filePath;
          }
          return !isGeneratedPath(filePath.toLowerCase());
        });
      }
    } catch {
      // Ignore status error
    }
  } catch (e) {
    console.warn("Could not retrieve git information.", e);
  }
} else {
  // Release build from CI
  releaseTag = rawCommit.startsWith("v") ? rawCommit : `v${rawCommit}`;
}

const legacyGitCommit = isReleaseBuild 
  ? (releaseTag || rawCommit) 
  : (isDirty ? `post-${releaseTag || rawCommit}` : (releaseTag || rawCommit));

const appBuildInfo = {
  version: pkg.version || "1.0.0",
  gitCommit: rawCommit,
  gitBranch,
  releaseTag,
  isDirty,
  isReleaseBuild,
  buildTime: new Date().toISOString(),
};

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), hudStaticPlugin()],
  define: {
    __APP_BUILD_INFO__: JSON.stringify(appBuildInfo),
    __GIT_COMMIT__: JSON.stringify(legacyGitCommit),
    __GIT_BRANCH__: JSON.stringify(gitBranch),
  },

  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        hud_frontend: path.resolve(__dirname, "hud_frontend/index.html"),
      },
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
