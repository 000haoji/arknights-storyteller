import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FONT_FAMILIES, ReaderSettings as Settings } from "@/hooks/useReaderSettings";
import { X, RotateCcw } from "lucide-react";

const READING_MODES: Array<{ value: Settings["readingMode"]; label: string; description: string }> = [
  { value: "scroll", label: "连续滚动", description: "纵向滚动阅读，更接近移动端小说体验" },
  { value: "paged", label: "章节分页", description: "按页分段阅读，便于快速定位" },
];

const THEMES: Array<{ value: Settings["theme"]; label: string; accent: string; background: string }> = [
  { value: "default", label: "极简白", accent: "#4c6ef5", background: "linear-gradient(135deg,#fafaff,#f2f4ff)" },
  { value: "sepia", label: "羊皮纸", accent: "#c97b35", background: "linear-gradient(135deg,#f4ecd8,#ead8b5)" },
  { value: "green", label: "护眼绿", accent: "#3a7d44", background: "linear-gradient(135deg,#e4f2e7,#cfe6d5)" },
  { value: "dark", label: "沉浸夜", accent: "#7dd3fc", background: "linear-gradient(135deg,#0f172a,#1e293b)" },
];

interface ReaderSettingsProps {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onUpdateSettings: (settings: Partial<Settings>) => void;
  onReset: () => void;
}

export function ReaderSettingsPanel({
  open,
  settings,
  onClose,
  onUpdateSettings,
  onReset,
}: ReaderSettingsProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <Card className="w-full max-w-md mx-4 mb-0 sm:mb-4 rounded-t-2xl sm:rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>阅读设置</CardTitle>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={onReset}>
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 阅读模式 */}
          <div className="space-y-3">
            <label className="text-sm font-medium">阅读模式</label>
            <div className="grid grid-cols-2 gap-2">
              {READING_MODES.map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => onUpdateSettings({ readingMode: mode.value })}
                  className={`p-3 border rounded-xl text-sm transition-colors text-left ${
                    settings.readingMode === mode.value
                      ? "border-[hsl(var(--color-primary))] bg-[hsl(var(--color-accent))] shadow-sm"
                      : "border-[hsl(var(--color-border))]"
                  }`}
                >
                  <div className="font-medium">{mode.label}</div>
                  <div className="text-xs text-[hsl(var(--color-muted-foreground))] mt-1 leading-relaxed">
                    {mode.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 主题 */}
          <div className="space-y-3">
            <label className="text-sm font-medium">阅读主题</label>
            <div className="grid grid-cols-2 gap-3">
              {THEMES.map((theme) => (
                <button
                  key={theme.value}
                  onClick={() => onUpdateSettings({ theme: theme.value })}
                  className={`p-3 rounded-xl border transition-all text-left ${
                    settings.theme === theme.value
                      ? "border-[hsl(var(--color-primary))] ring-2 ring-[hsl(var(--color-primary)/0.2)]"
                      : "border-[hsl(var(--color-border))]"
                  }`}
                  style={{ background: theme.background }}
                >
                  <div className="font-medium" style={{ color: theme.accent }}>
                    {theme.label}
                  </div>
                  <div className="text-[10px] uppercase tracking-widest opacity-70">
                    {theme.value}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 字体选择 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">字体</label>
            <div className="grid grid-cols-2 gap-2">
              {FONT_FAMILIES.map((font) => (
                <button
                  key={font.value}
                  onClick={() => onUpdateSettings({ fontFamily: font.value })}
                  className={`p-2 border rounded-md text-sm transition-colors ${
                    settings.fontFamily === font.value
                      ? "border-[hsl(var(--color-primary))] bg-[hsl(var(--color-accent))]"
                      : "border-[hsl(var(--color-border))]"
                  }`}
                  style={{ fontFamily: font.value === "system" ? undefined : font.value }}
                >
                  {font.label}
                </button>
              ))}
            </div>
          </div>

          {/* 字号 */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-medium">字号</label>
              <span className="text-sm text-[hsl(var(--color-muted-foreground))]">
                {settings.fontSize}px
              </span>
            </div>
            <input
              type="range"
              min="14"
              max="32"
              step="2"
              value={settings.fontSize}
              onChange={(e) => onUpdateSettings({ fontSize: parseInt(e.target.value, 10) })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-[hsl(var(--color-muted-foreground))]">
              <span>小</span>
              <span>大</span>
            </div>
          </div>

          {/* 行距 */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-medium">行距</label>
              <span className="text-sm text-[hsl(var(--color-muted-foreground))]">
                {settings.lineHeight.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="1.4"
              max="3.4"
              step="0.1"
              value={settings.lineHeight}
              onChange={(e) => onUpdateSettings({ lineHeight: parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>

          {/* 字间距 */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-medium">字间距</label>
              <span className="text-sm text-[hsl(var(--color-muted-foreground))]">
                {settings.letterSpacing.toFixed(1)}px
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="4"
              step="0.5"
              value={settings.letterSpacing}
              onChange={(e) => onUpdateSettings({ letterSpacing: parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>

          {/* 段落间距 */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-medium">段落间距</label>
              <span className="text-sm text-[hsl(var(--color-muted-foreground))]">
                {settings.paragraphSpacing.toFixed(1)}rem
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="4"
              step="0.25"
              value={settings.paragraphSpacing}
              onChange={(e) =>
                onUpdateSettings({ paragraphSpacing: parseFloat(e.target.value) })
              }
              className="w-full"
            />
          </div>

          {/* 页面宽度 */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-medium">页面宽度</label>
              <span className="text-sm text-[hsl(var(--color-muted-foreground))]">
                {settings.pageWidth}%
              </span>
            </div>
            <input
              type="range"
              min="60"
              max="100"
              step="5"
              value={settings.pageWidth}
              onChange={(e) => onUpdateSettings({ pageWidth: parseInt(e.target.value, 10) })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-[hsl(var(--color-muted-foreground))]">
              <span>窄幅</span>
              <span>全宽</span>
            </div>
          </div>

          {/* 对齐方式 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">对齐方式</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onUpdateSettings({ textAlign: "left" })}
                className={`p-2 border rounded-md text-sm transition-colors ${
                  settings.textAlign === "left"
                    ? "border-[hsl(var(--color-primary))] bg-[hsl(var(--color-accent))]"
                    : "border-[hsl(var(--color-border))]"
                }`}
              >
                左对齐
              </button>
              <button
                onClick={() => onUpdateSettings({ textAlign: "justify" })}
                className={`p-2 border rounded-md text-sm transition-colors ${
                  settings.textAlign === "justify"
                    ? "border-[hsl(var(--color-primary))] bg-[hsl(var(--color-accent))]"
                    : "border-[hsl(var(--color-border))]"
                }`}
              >
                两端对齐
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
