import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: [
      "scheduler",
      "stats.js",
      "stats-gl",
      "zustand/traditional",
      "use-sync-external-store/shim/with-selector.js",
    ],
    exclude: [
      "@react-three/fiber",
      "@react-three/drei",
      "@react-three/postprocessing",
      "postprocessing",
      "three",
      "@tanstack/react-query-devtools",
    ],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          const inPackage = (name: string) =>
            id.includes(`/node_modules/${name}/`) ||
            id.includes(`\\node_modules\\${name}\\`);

          if (inPackage("react") || inPackage("react-dom") || inPackage("scheduler")) {
            return "react-vendor";
          }

          if (inPackage("@tanstack/react-query") || inPackage("@tanstack/query-core")) {
            return "query";
          }

          if (inPackage("framer-motion") || inPackage("lucide-react")) {
            return "ui-motion";
          }

          if (inPackage("@xyflow/react")) {
            return "topology";
          }

          if (inPackage("three") || inPackage("postprocessing")) {
            return "three-core";
          }

          if (
            inPackage("@react-three/fiber") ||
            inPackage("@react-three/drei") ||
            inPackage("@react-three/postprocessing")
          ) {
            return "three-react";
          }

          if (
            inPackage("zod") ||
            inPackage("react-hook-form") ||
            inPackage("@hookform/resolvers")
          ) {
            return "forms";
          }

          if (inPackage("axios") || inPackage("zustand")) {
            return "data";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
