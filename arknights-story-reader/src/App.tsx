import { useState } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { StoryList } from "@/components/StoryList";
import { StoryReader } from "@/components/StoryReader";
import { SearchPanel } from "@/components/SearchPanel";
import { Settings } from "@/components/Settings";
import { BottomNav } from "@/components/BottomNav";
import type { StoryEntry } from "@/types/story";
import { FavoritesProvider } from "@/hooks/useFavorites";

type Tab = "stories" | "search" | "settings";

interface ReaderFocus {
  storyId: string;
  query: string;
  snippet?: string | null;
  issuedAt: number;
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("stories");
  const [selectedStory, setSelectedStory] = useState<StoryEntry | null>(null);
  const [readerFocus, setReaderFocus] = useState<ReaderFocus | null>(null);

  const handleSelectStory = (story: StoryEntry) => {
    console.log("[App] 选择剧情:", story.storyName);
    setSelectedStory(story);
    setReaderFocus(null);
  };

  const handleBackToList = () => {
    console.log("[App] 返回剧情列表");
    setSelectedStory(null);
    setReaderFocus(null);
  };

  const handleSearchResult = (story: StoryEntry, focus: { query: string; snippet?: string | null }) => {
    console.log("[App] 搜索结果选择，storyId:", story.storyId);
    setSelectedStory(story);
    setReaderFocus({ storyId: story.storyId, query: focus.query, snippet: focus.snippet, issuedAt: Date.now() });
    setActiveTab("stories");
  };

  console.log("[App] 当前状态 - activeTab:", activeTab, "selectedStory:", selectedStory?.storyName || null);

  const appContent = selectedStory ? (
    <StoryReader
      storyPath={selectedStory.storyTxt}
      storyName={selectedStory.storyName}
      storyId={selectedStory.storyId}
      initialFocus={
        readerFocus && readerFocus.storyId === selectedStory.storyId ? readerFocus : null
      }
      onBack={handleBackToList}
    />
  ) : (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden">
        {activeTab === "stories" && <StoryList onSelectStory={handleSelectStory} />}
        {activeTab === "search" && <SearchPanel onSelectResult={handleSearchResult} />}
        {activeTab === "settings" && <Settings />}
      </div>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );

  return (
    <ThemeProvider defaultTheme="dark" storageKey="story-teller-theme">
      <FavoritesProvider>{appContent}</FavoritesProvider>
    </ThemeProvider>
  );
}

export default App;
