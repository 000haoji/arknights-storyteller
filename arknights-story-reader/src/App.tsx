import { useCallback, useMemo, useState } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { StoryList } from "@/components/StoryList";
import { StoryReader } from "@/components/StoryReader";
import { SearchPanel } from "@/components/SearchPanel";
import { Settings } from "@/components/Settings";
import { BottomNav } from "@/components/BottomNav";
import type { StoryEntry } from "@/types/story";
import { FavoritesProvider } from "@/hooks/useFavorites";
import { KeepAlive } from "@/components/KeepAlive";
import { CharactersPanel } from "@/components/CharactersPanel";

type Tab = "stories" | "characters" | "search" | "settings";

interface ReaderFocus {
  storyId: string;
  query: string;
  snippet?: string | null;
  issuedAt: number;
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("stories");
  const [readerVisible, setReaderVisible] = useState(false);
  const [readerStory, setReaderStory] = useState<StoryEntry | null>(null);
  const [readerFocus, setReaderFocus] = useState<ReaderFocus | null>(null);
  const [readerInitialCharacter, setReaderInitialCharacter] = useState<string | null>(null);

  const readerActive = readerVisible && readerStory !== null;

  const handleSelectStory = useCallback((story: StoryEntry) => {
    console.log("[App] 选择剧情:", story.storyName);
    setReaderStory(story);
    setReaderFocus(null);
    setReaderInitialCharacter(null);
    setReaderVisible(true);
  }, []);

  const handleBackToList = useCallback(() => {
    console.log("[App] 返回剧情列表");
    setReaderVisible(false);
  }, []);

  const handleSearchResult = useCallback(
    (story: StoryEntry, focus: { query: string; snippet?: string | null }) => {
      console.log("[App] 搜索结果选择，storyId:", story.storyId);
      setReaderStory(story);
      setReaderFocus({
        storyId: story.storyId,
        query: focus.query,
        snippet: focus.snippet,
        issuedAt: Date.now(),
      });
      setReaderInitialCharacter(null);
      setReaderVisible(true);
    },
    []
  );

  const handleOpenStoryWithCharacter = useCallback(
    (story: StoryEntry, character: string) => {
      console.log("[App] 从人物面板打开剧情:", story.storyName, "角色:", character);
      setReaderStory(story);
      setReaderFocus(null);
      setReaderInitialCharacter(character);
      setReaderVisible(true);
    },
    []
  );

  const handleTabChange = useCallback(
    (tab: Tab) => {
      if (readerActive) {
        setReaderVisible(false);
      }
      setActiveTab(tab);
    },
    [readerActive]
  );

  const storyListView = useMemo(
    () => <StoryList onSelectStory={handleSelectStory} />,
    [handleSelectStory]
  );
  const searchView = useMemo(
    () => <SearchPanel onSelectResult={handleSearchResult} />,
    [handleSearchResult]
  );
  const settingsView = useMemo(() => <Settings />, []);

  const readerView = readerStory ? (
    <StoryReader
      key={readerStory.storyId}
      storyPath={readerStory.storyTxt}
      storyName={readerStory.storyName}
      storyId={readerStory.storyId}
      initialCharacter={readerInitialCharacter ?? undefined}
      initialFocus={
        readerFocus && readerFocus.storyId === readerStory.storyId ? readerFocus : null
      }
      onBack={handleBackToList}
    />
  ) : null;

  console.log(
    "[App] 当前状态 - activeTab:",
    activeTab,
    "readerVisible:",
    readerVisible,
    "readerStory:",
    readerStory?.storyName ?? null
  );

  const appContent = (
    <div className="h-full flex flex-col overflow-hidden pt-[calc(env(safe-area-inset-top,0px)+20px)]">
      <div className="relative flex-1 overflow-hidden">
        <KeepAlive active={!readerActive && activeTab === "stories"} className="absolute inset-0">
          {storyListView}
        </KeepAlive>
        <KeepAlive
          active={!readerActive && activeTab === "characters"}
          className="absolute inset-0"
        >
          <CharactersPanel onOpenStory={handleOpenStoryWithCharacter} />
        </KeepAlive>
        <KeepAlive active={!readerActive && activeTab === "search"} className="absolute inset-0">
          {searchView}
        </KeepAlive>
        <KeepAlive active={!readerActive && activeTab === "settings"} className="absolute inset-0">
          {settingsView}
        </KeepAlive>
        {readerStory && (
          <KeepAlive active={readerActive} className="absolute inset-0">
            {readerView}
          </KeepAlive>
        )}
      </div>
      {!readerActive && <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />}
    </div>
  );

  return (
    <ThemeProvider defaultTheme="dark" storageKey="story-teller-theme">
      <FavoritesProvider>{appContent}</FavoritesProvider>
    </ThemeProvider>
  );
}

export default App;
