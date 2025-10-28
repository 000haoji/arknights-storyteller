import { Book, Search, Settings, Users2, ListChecks, Package } from "lucide-react";
import { cn } from "@/lib/utils";

interface BottomNavProps {
  activeTab: "stories" | "characters" | "search" | "clues" | "settings" | "furniture";
  onTabChange: (tab: "stories" | "characters" | "search" | "clues" | "settings" | "furniture") => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[hsl(var(--color-background)/0.95)] backdrop-blur border-t motion-safe:animate-in motion-safe:slide-in-from-bottom-10 motion-safe:duration-500">
      <div className="container flex items-center justify-around h-16">
        <button
          onClick={() => onTabChange("stories")}
          className={cn(
            "flex flex-col items-center gap-1 flex-1 py-2 transition-colors",
            activeTab === "stories" ? "text-[hsl(var(--color-primary))]" : "text-[hsl(var(--color-muted-foreground))]"
          )}
        >
          <Book className="h-5 w-5" />
          <span className="text-xs">剧情</span>
        </button>

        <button
          onClick={() => onTabChange("clues")}
          className={cn(
            "flex flex-col items-center gap-1 flex-1 py-2 transition-colors",
            activeTab === "clues" ? "text-[hsl(var(--color-primary))]" : "text-[hsl(var(--color-muted-foreground))]"
          )}
        >
          <ListChecks className="h-5 w-5" />
          <span className="text-xs">线索集</span>
        </button>

        <button
          onClick={() => onTabChange("characters")}
          className={cn(
            "flex flex-col items-center gap-1 flex-1 py-2 transition-colors",
            activeTab === "characters" ? "text-[hsl(var(--color-primary))]" : "text-[hsl(var(--color-muted-foreground))]"
          )}
        >
          <Users2 className="h-5 w-5" />
          <span className="text-xs">人物</span>
        </button>

        <button
          onClick={() => onTabChange("furniture")}
          className={cn(
            "flex flex-col items-center gap-1 flex-1 py-2 transition-colors",
            activeTab === "furniture" ? "text-[hsl(var(--color-primary))]" : "text-[hsl(var(--color-muted-foreground))]"
          )}
        >
          <Package className="h-5 w-5" />
          <span className="text-xs">道具</span>
        </button>

        <button
          onClick={() => onTabChange("search")}
          className={cn(
            "flex flex-col items-center gap-1 flex-1 py-2 transition-colors",
            activeTab === "search" ? "text-[hsl(var(--color-primary))]" : "text-[hsl(var(--color-muted-foreground))]"
          )}
        >
          <Search className="h-5 w-5" />
          <span className="text-xs">搜索</span>
        </button>

        <button
          onClick={() => onTabChange("settings")}
          className={cn(
            "flex flex-col items-center gap-1 flex-1 py-2 transition-colors",
            activeTab === "settings" ? "text-[hsl(var(--color-primary))]" : "text-[hsl(var(--color-muted-foreground))]"
          )}
        >
          <Settings className="h-5 w-5" />
          <span className="text-xs">设置</span>
        </button>
      </div>
    </nav>
  );
}
