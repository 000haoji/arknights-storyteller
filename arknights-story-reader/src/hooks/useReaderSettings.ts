import { useState, useEffect } from "react";

export interface ReaderSettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
}

const DEFAULT_SETTINGS: ReaderSettings = {
  fontFamily: "system",
  fontSize: 18,
  lineHeight: 2,
  letterSpacing: 0,
};

const STORAGE_KEY = "reader-settings";

export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      } catch {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSettings = (partial: Partial<ReaderSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  return { settings, updateSettings, resetSettings };
}

export const FONT_FAMILIES = [
  { value: "system", label: "系统默认" },
  { value: "'Songti SC', 'STSong', serif", label: "宋体" },
  { value: "'Heiti SC', 'STHeiti', sans-serif", label: "黑体" },
  { value: "'Kaiti SC', 'STKaiti', serif", label: "楷体" },
  { value: "'PingFang SC', -apple-system, sans-serif", label: "苹方" },
  { value: "'Noto Serif SC', serif", label: "思源宋体" },
];

