/**
 * 全局日志工具：在生产环境自动收敛信息性日志，仅保留警告与错误
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const isDev = import.meta.env.DEV;

function shouldLog(level: LogLevel): boolean {
  if (isDev) return true;
  // 生产环境仅允许 warn 和 error
  return level === "warn" || level === "error";
}

function formatMessage(tag: string, ...args: unknown[]): unknown[] {
  return [`[${tag}]`, ...args];
}

export const logger = {
  debug(tag: string, ...args: unknown[]) {
    if (shouldLog("debug")) {
      console.debug(...formatMessage(tag, ...args));
    }
  },

  info(tag: string, ...args: unknown[]) {
    if (shouldLog("info")) {
      console.log(...formatMessage(tag, ...args));
    }
  },

  warn(tag: string, ...args: unknown[]) {
    if (shouldLog("warn")) {
      console.warn(...formatMessage(tag, ...args));
    }
  },

  error(tag: string, ...args: unknown[]) {
    if (shouldLog("error")) {
      console.error(...formatMessage(tag, ...args));
    }
  },
};

