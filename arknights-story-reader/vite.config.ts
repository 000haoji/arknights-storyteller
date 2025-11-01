import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // 构建优化：代码分割
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // 分离 React 核心库
          "react-vendor": ["react", "react-dom"],
          // 分离 Tauri API
          "tauri-vendor": [
            "@tauri-apps/api",
            "@tauri-apps/plugin-dialog",
            "@tauri-apps/plugin-opener",
            "@tauri-apps/plugin-process",
            "@tauri-apps/plugin-updater",
          ],
          // 分离 UI 库
          "ui-vendor": ["lucide-react", "clsx", "tailwind-merge"],
        },
      },
    },
    // 提升构建性能
    target: "esnext",
    minify: "terser",
    terserOptions: {
      compress: {
        // 注意：不使用 drop_console，因为 logger 需要在生产环境保留 warn/error
        // logger 内部已通过运行时判断控制输出
        drop_debugger: true,
        pure_funcs: ["console.debug"], // 仅移除 console.debug
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1450,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1451,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
