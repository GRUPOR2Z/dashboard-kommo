import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/proxy": {
        target: "https://nutrijosiaspapa.kommo.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy/, "/api/v4"),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            // Vite proxy forwards original request headers (including Authorization)
          });
        },
      },
    },
  },
});
