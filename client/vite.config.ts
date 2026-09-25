import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Se a 5173 estiver ocupada (outra cópia rodando), avisa em vez de ir para outra porta.
    strictPort: true,
    proxy: {
      "/api": "http://localhost:3333",
    },
  },
});
