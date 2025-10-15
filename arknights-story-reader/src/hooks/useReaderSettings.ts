import { useState, useEffect } from "react";

export const FONT_FAMILIES = [
  {
    value: "'Arknights Noto Serif SC', 'Noto Serif SC', 'Source Han Serif SC', serif",
    label: "内置 · 思源宋体",
  },
  {
    value: "'Arknights Noto Sans SC', 'Noto Sans SC', 'Source Han Sans SC', sans-serif",
    label: "内置 · 思源黑体",
  },
  {
    value: "'Arknights LXGW WenKai', 'LXGW WenKai', 'Noto Serif SC', serif",
    label: "内置 · 霞鹜文楷",
  },
  { value: "system", label: "系统默认" },
];

const FONT_FAMILY_VALUES = new Set(FONT_FAMILIES.map((font) => font.value));

export interface ReaderSettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  paragraphSpacing: number; // 段落间距
  pageWidth: number; // 页面宽度（百分比）
  textAlign: 'left' | 'justify'; // 文本对齐方式
  theme: 'default' | 'sepia' | 'green' | 'dark'; // 阅读主题
  readingMode: 'paged' | 'scroll'; // 阅读模式：分页/滚动
}

const DEFAULT_SETTINGS: ReaderSettings = {
  fontFamily: "'Arknights Noto Serif SC', 'Noto Serif SC', 'Source Han Serif SC', serif",
  fontSize: 18,
  lineHeight: 1.8,
  letterSpacing: 0,
  paragraphSpacing: 0.7, // rem
  pageWidth: 100, // 100%
  textAlign: 'justify',
  theme: 'default',
  readingMode: 'scroll',
};

const STORAGE_KEY = "reader-settings";

export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<ReaderSettings>;
        const ff = parsed.fontFamily;
        const fontFamily: string = ff && FONT_FAMILY_VALUES.has(ff) ? ff : DEFAULT_SETTINGS.fontFamily;
        return { ...DEFAULT_SETTINGS, ...parsed, fontFamily } as ReaderSettings;
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
