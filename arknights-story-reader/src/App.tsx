import { useState } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { StoryList } from "@/components/StoryList";
import { StoryReader } from "@/components/StoryReader";
import { SearchPanel } from "@/components/SearchPanel";
import { Settings } from "@/components/Settings";
import { BottomNav } from "@/components/BottomNav";
import type { StoryEntry } from "@/types/story";

type Tab = "stories" | "search" | "settings";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("stories");
  const [selectedStory, setSelectedStory] = useState<StoryEntry | null>(null);

  const handleSelectStory = (story: StoryEntry) => {
    console.log("[App] 选择剧情:", story.storyName);
    setSelectedStory(story);
  };

  const handleBackToList = () => {
    console.log("[App] 返回剧情列表");
    setSelectedStory(null);
  };

  const handleSearchResult = (storyId: string) => {
    console.log("[App] 搜索结果选择，storyId:", storyId);
    // This would ideally fetch the story by ID and set it
    // For now, we'll just switch to stories tab
    setActiveTab("stories");
  };

  console.log("[App] 当前状态 - activeTab:", activeTab, "selectedStory:", selectedStory?.storyName || null);

  // If a story is selected, show the reader
  if (selectedStory) {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="story-teller-theme">
        <StoryReader
          storyPath={selectedStory.storyTxt}
          storyName={selectedStory.storyName}
          onBack={handleBackToList}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="dark" storageKey="story-teller-theme">
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {activeTab === "stories" && <StoryList onSelectStory={handleSelectStory} />}
          {activeTab === "search" && <SearchPanel onSelectResult={handleSearchResult} />}
          {activeTab === "settings" && <Settings />}
        </div>
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </ThemeProvider>
  );
}

export default App;
