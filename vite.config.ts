import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { excalidrawPaletteEsbuildPlugin, excalidrawPalettePlugin } from "./build/excalidrawPalette";

export default defineConfig({
  base: "./",
  plugins: [excalidrawPalettePlugin(), react()],
  define: {
    global: "window",
  },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [excalidrawPaletteEsbuildPlugin()],
    },
  },
  server: { port: 5173 },
  build: { target: "es2022" },
});
