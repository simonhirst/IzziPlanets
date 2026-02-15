import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "./",
  esbuild: {
    drop: ["debugger"],
    legalComments: "none",
  },
  build: {
    sourcemap: false,
    target: "es2022",
    minify: "esbuild",
    cssCodeSplit: true,
    cssMinify: true,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 700,
    modulePreload: {
      polyfill: false,
    },
    rollupOptions: {
      treeshake: {
        moduleSideEffects: false,
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "vendor-three";
          if (id.includes("node_modules/web-vitals")) return "vendor-web-vitals";
          if (id.includes("src/modules/app-runtime")) return "app-runtime";
          return undefined;
        },
      },
    },
  },
  server: {
    port: 4173,
  },
  preview: {
    port: 4173,
  },
});
