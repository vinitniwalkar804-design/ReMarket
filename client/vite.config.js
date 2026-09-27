import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Without this, a second `npm run dev` finds 5173 taken and silently moves
    // to 5174. The browser is still pointed at 5173, so it keeps being served by
    // the *previous* dev server while the terminal shows a healthy "ready" on a
    // port nobody opened - and edits appear not to take effect. Failing loudly
    // makes the stale process visible instead of hiding it.
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:5050",
        changeOrigin: true,
      },
    },
  },
});