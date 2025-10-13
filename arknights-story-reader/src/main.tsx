import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// 全局错误处理
window.addEventListener('error', (event) => {
  console.error('[Global] 未捕获的错误:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Global] 未处理的Promise拒绝:', event.reason);
});

console.log('[Main] 应用启动');
console.log('[Main] 环境:', import.meta.env.MODE);
console.log('[Main] Tauri 可用:', typeof window.__TAURI__ !== 'undefined');

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

console.log('[Main] React 应用已挂载');
