import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { logger } from "./lib/logger";

// 初始化 logger（开发环境启用调试输出）
logger.init(import.meta.env.MODE === 'development');

// 全局错误处理（在生产环境保留错误日志，收敛无关信息）
window.addEventListener('error', (event) => {
  logger.error('Global', '未捕获的错误:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  logger.error('Global', '未处理的Promise拒绝:', event.reason);
});

logger.debug('Main', '应用启动');
logger.debug('Main', '环境:', import.meta.env.MODE);
logger.debug('Main', 'Tauri 可用:', "__TAURI__" in window);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

logger.debug('Main', 'React 应用已挂载');
