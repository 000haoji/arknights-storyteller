import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FONT_FAMILIES, ReaderSettings as Settings } from "@/hooks/useReaderSettings";
import { X, RotateCcw } from "lucide-react";

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
              max="28"
              step="2"
              value={settings.fontSize}
              onChange={(e) => onUpdateSettings({ fontSize: parseInt(e.target.value) })}
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
              min="1.5"
              max="3"
              step="0.1"
              value={settings.lineHeight}
              onChange={(e) => onUpdateSettings({ lineHeight: parseFloat(e.target.value) })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-[hsl(var(--color-muted-foreground))]">
              <span>紧凑</span>
              <span>宽松</span>
            </div>
          </div>

          {/* 字间距 */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-medium">字间距</label>
              <span className="text-sm text-[hsl(var(--color-muted-foreground))]">
                {settings.letterSpacing}px
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
            <div className="flex justify-between text-xs text-[hsl(var(--color-muted-foreground))]">
              <span>正常</span>
              <span>宽</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

