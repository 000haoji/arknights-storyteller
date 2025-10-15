import { useCallback, useEffect, useMemo, useState } from "react";
import { useClueSets } from "@/hooks/useClueSets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomScrollArea } from "@/components/ui/custom-scroll-area";
import { Input } from "@/components/ui/input";
import { Share2, Trash2, Plus, Copy, Pencil, ArrowDown, BookOpen, ArrowUp } from "lucide-react";
import { api } from "@/services/api";
import type { StoryEntry } from "@/types/story";
import { normalizeForDigest, fnv1a64, digestToHex64 } from "@/lib/clueCodecs";
import { Collapsible } from "@/components/ui/collapsible";

interface ClueSetsPanelProps {
  onOpenStoryJump: (story: StoryEntry, jump: { segmentIndex: number; digestHex?: string; preview?: string }) => void;
  onReadSet?: (setId: string) => void;
}

export function ClueSetsPanel({ onOpenStoryJump, onReadSet }: ClueSetsPanelProps) {
  const { sets, createSet, deleteSet, renameSet, removeItem, setItems, exportShareCode, importShareCode, updateItemMeta, addItems } = useClueSets();
  const [importCode, setImportCode] = useState("");
  const [busySetId, setBusySetId] = useState<string | null>(null);
  const [storyCache, setStoryCache] = useState<Record<string, StoryEntry | null>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameSetId, setRenameSetId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState<string>("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSetId, setDeleteSetId] = useState<string | null>(null);
  const [deleteTitle, setDeleteTitle] = useState<string>("");

  const allStoryIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(sets).forEach((s) => s.items.forEach((it) => ids.add(it.storyId)));
    return Array.from(ids);
  }, [sets]);

  useEffect(() => {
    // Lazy load story entries into cache
    let cancelled = false;
    (async () => {
      for (const id of allStoryIds) {
        if (cancelled) break;
        if (storyCache[id] !== undefined) continue;
        try {
          const entry = await api.getStoryEntry(id);
          setStoryCache((prev) => ({ ...prev, [id]: entry }));
        } catch {
          setStoryCache((prev) => ({ ...prev, [id]: null }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [allStoryIds, storyCache]);

  const handleCreate = () => {
    // 避免某些环境 window.prompt 不可用，直接快速创建默认名称
    const base = "我的线索集";
    const titles = new Set(Object.values(sets).map((s) => s.title));
    let name = base;
    let i = 2;
    while (titles.has(name)) {
      name = `${base} (${i})`;
      i += 1;
      if (i > 99) break;
    }
    createSet(name);
    setMessage(`已创建：${name}`);
    setTimeout(() => setMessage(null), 1200);
  };

  const handleExport = async (setId: string) => {
    try {
      setBusySetId(setId);
      const code = await exportShareCode(setId);
      await navigator.clipboard.writeText(code);
      setMessage("分享码已复制到剪贴板");
      setTimeout(() => setMessage(null), 1200);
    } catch (err) {
      console.error(err);
      setMessage("导出失败");
      setTimeout(() => setMessage(null), 1500);
    } finally {
      setBusySetId(null);
    }
  };

  const handleImport = async () => {
    const code = importCode.trim();
    if (!code) return;
    try {
      setBusySetId("__import__");
      let targetSetId: string | undefined = undefined;
      const entries = Object.values(sets).sort((a, b) => b.updatedAt - a.updatedAt);
      if (entries.length > 0) {
        const listing = entries.map((s, i) => `${i + 1}. ${s.title}（${s.items.length}）`).join("\n");
        const input = window.prompt(`输入导入目标线索集序号，留空则新建：\n${listing}`) || "";
        const n = Number(input);
        if (Number.isFinite(n) && n >= 1 && n <= entries.length) {
          targetSetId = entries[n - 1].id;
        }
      }
      const res = await importShareCode(code, { createIfMissing: true, titleIfCreate: "导入的线索集", targetSetId });
      setImportCode("");
      setMessage(res.created ? "已创建并导入线索集" : `已导入 ${res.itemsAdded} 条`);
      setTimeout(() => setMessage(null), 1500);
    } catch (err) {
      console.error(err);
      setMessage("导入失败，分享码无效或不兼容");
      setTimeout(() => setMessage(null), 2000);
    } finally {
      setBusySetId(null);
    }
  };

  const handleOpen = async (storyId: string, segmentIndex: number, digestHex?: string, preview?: string) => {
    try {
      const story = storyCache[storyId] ?? (await api.getStoryEntry(storyId));
      if (!story) throw new Error("剧情不存在");
      onOpenStoryJump(story, { segmentIndex, digestHex, preview });
    } catch (err) {
      console.error(err);
      setMessage("打开剧情失败");
      setTimeout(() => setMessage(null), 1500);
    }
  };

  const sortedSets = useMemo(() => Object.values(sets).sort((a, b) => b.updatedAt - a.updatedAt), [sets]);

  // Lazy compute preview for items lacking preview
  useEffect(() => {
    let cancelled = false;
    async function ensurePreview() {
      type Task = { setId: string; storyId: string; segmentIndex: number };
      const tasks: Task[] = [];
      for (const s of sortedSets) {
        for (const it of s.items) {
          if (!it.preview) tasks.push({ setId: s.id, storyId: it.storyId, segmentIndex: it.segmentIndex });
        }
      }
      if (tasks.length === 0) return;
      // group by storyId
      const groups = new Map<string, Task[]>();
      for (const t of tasks) {
        const arr = groups.get(t.storyId) ?? [];
        arr.push(t);
        groups.set(t.storyId, arr);
      }
      for (const [sid, bucket] of groups) {
        if (cancelled) break;
        try {
          const entry = storyCache[sid] ?? (await api.getStoryEntry(sid));
          if (!entry) continue;
          if (!storyCache[sid]) setStoryCache((prev) => ({ ...prev, [sid]: entry }));
          const content = await api.getStoryContent(entry.storyTxt);
          // process segments similar to StoryReader
          const cleaned = content.segments.flatMap((segment: any) => {
            if (segment.type === "dialogue" || segment.type === "narration") {
              const normalizedText = String(segment.text || "")
                .replace(/\r\n/g, "\n")
                .split("\n").map((line: string) => line.trim()).filter(Boolean).join("\n");
              if (!normalizedText) return [] as any[];
              if (normalizedText === segment.text) return [segment];
              return [{ ...segment, text: normalizedText }];
            }
            if (segment.type === "decision") {
              const options = (segment.options || []).map((o: string) => String(o || "").trim()).filter(Boolean);
              if (options.length === 0) return [] as any[];
              if (options.length === segment.options.length) return [segment];
              return [{ ...segment, options }];
            }
            return [segment];
          });
          const merged: any[] = [];
          cleaned.forEach((segment: any) => {
            if (segment.type === "dialogue") {
              const last = merged[merged.length - 1];
              if (last && last.type === "dialogue" && last.characterName === segment.characterName) {
                merged[merged.length - 1] = { ...last, text: `${last.text}\n${segment.text}`.replace(/\n{2,}/g, "\n") };
                return;
              }
            }
            merged.push(segment);
          });
          const getPreview = (seg: any) => {
            switch (seg.type) {
              case "dialogue": {
                const primary = String(seg.text || "").split("\n")[0] ?? "";
                return `${seg.characterName}: ${primary}`.replace(/\s+/g, " ").trim();
              }
              case "narration":
              case "system":
              case "subtitle":
              case "sticker":
                return String(seg.text || "").split("\n")[0]?.replace(/\s+/g, " ").trim() ?? "";
              default:
                return "";
            }
          };
          for (const t of bucket) {
            if (cancelled) break;
            const seg = merged[t.segmentIndex];
            if (!seg) continue;
            const preview = getPreview(seg);
            if (preview) updateItemMeta(t.setId, t.storyId, t.segmentIndex, { preview });
          }
        } catch {
          // ignore errors per story
        }
      }
    }
    void ensurePreview();
    return () => { cancelled = true; };
  }, [sortedSets, storyCache, updateItemMeta]);

  // 从“划线收藏”导入到某个线索集
  const handleImportFromHighlights = useCallback(async (targetSetId: string) => {
    try {
      setBusySetId(targetSetId);
      // 1) 读取本地划线
      const raw = localStorage.getItem("reader-highlights");
      if (!raw) {
        setMessage("暂无划线可导入");
        setTimeout(() => setMessage(null), 1500);
        return;
      }
      const store = JSON.parse(raw) as Record<string, number[]>;
      const entries = Object.entries(store).filter(([, arr]) => Array.isArray(arr) && arr.length > 0);
      if (entries.length === 0) {
        setMessage("暂无划线可导入");
        setTimeout(() => setMessage(null), 1500);
        return;
      }

      // 2) 构建 storyTxt -> StoryEntry 映射
      // 通过分类 API 扫描所有剧情条目（本地数据，速度可接受）
      const categories = await api.getStoryCategories();
      const pathMap = new Map<string, StoryEntry>();
      categories.forEach((cat) => {
        (cat.stories || []).forEach((se: StoryEntry) => pathMap.set(se.storyTxt, se));
      });

      // 3) 遍历每个 storyPath，取内容并生成条目
      const toAdd: Array<{ storyId: string; segmentIndex: number; preview?: string; digestHex?: string }> = [];
      for (const [storyPath, idxArr] of entries) {
        const entry = pathMap.get(storyPath);
        if (!entry) continue;
        const content = await api.getStoryContent(storyPath);
        // 清洗与合并（与 Reader 相同的规则的简化实现）
        const cleaned = content.segments.flatMap((segment: any) => {
          if (segment.type === "dialogue" || segment.type === "narration") {
            const normalizedText = String(segment.text || "")
              .replace(/\r\n/g, "\n")
              .split("\n").map((line: string) => line.trim()).filter(Boolean).join("\n");
            if (!normalizedText) return [] as any[];
            if (normalizedText === segment.text) return [segment];
            return [{ ...segment, text: normalizedText }];
          }
          if (segment.type === "decision") {
            const options = (segment.options || []).map((o: string) => String(o || "").trim()).filter(Boolean);
            if (options.length === 0) return [] as any[];
            if (options.length === segment.options.length) return [segment];
            return [{ ...segment, options }];
          }
          return [segment];
        });
        const merged: any[] = [];
        cleaned.forEach((segment: any) => {
          if (segment.type === "dialogue") {
            const last = merged[merged.length - 1];
            if (last && last.type === "dialogue" && last.characterName === segment.characterName) {
              merged[merged.length - 1] = { ...last, text: `${last.text}\n${segment.text}`.replace(/\n{2,}/g, "\n") };
              return;
            }
          }
          merged.push(segment);
        });
        const getPreview = (seg: any) => {
          switch (seg.type) {
            case "dialogue": {
              const primary = String(seg.text || "").split("\n")[0] ?? "";
              return `${seg.characterName}: ${primary}`.replace(/\s+/g, " ").trim();
            }
            case "narration":
            case "system":
            case "subtitle":
            case "sticker":
              return String(seg.text || "").split("\n")[0]?.replace(/\s+/g, " ").trim() ?? "";
            default:
              return "";
          }
        };
        const getDigest = (seg: any) => digestToHex64(fnv1a64(normalizeForDigest(seg.type === 'dialogue' ? `${seg.characterName} ${seg.text}` : seg.type === 'system' && seg.speaker ? `${seg.speaker} ${seg.text}` : (seg.text || ''))));

        const uniq = new Set<number>();
        idxArr.forEach((n) => { if (Number.isFinite(n)) uniq.add(n|0); });
        for (const idx of uniq) {
          const seg = merged[idx];
          if (!seg) continue;
          const preview = getPreview(seg);
          const digestHex = getDigest(seg);
          toAdd.push({ storyId: entry.storyId, segmentIndex: idx, preview, digestHex });
        }
      }

      if (toAdd.length === 0) {
        setMessage("没有可导入的划线");
        setTimeout(() => setMessage(null), 1500);
        return;
      }

      addItems(targetSetId, toAdd);
      setMessage(`已导入 ${toAdd.length} 条划线`);
      setTimeout(() => setMessage(null), 1500);
    } catch (err) {
      console.error(err);
      setMessage("导入划线失败");
      setTimeout(() => setMessage(null), 2000);
    } finally {
      setBusySetId(null);
    }
  }, [addItems]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <header className="flex-shrink-0 z-10 bg-[hsl(var(--color-background)/0.95)] backdrop-blur border-b">
        <div className="container py-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" /> 新建线索集
            </Button>
            <div className="flex-1" />
            {message && <div className="text-xs text-[hsl(var(--color-muted-foreground))]">{message}</div>}
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="粘贴分享码导入 (AKC1-...)"
              value={importCode}
              onChange={(e) => setImportCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleImport(); }}
            />
            <Button onClick={handleImport} disabled={!importCode.trim() || busySetId === "__import__"}>
              <Share2 className="h-4 w-4 mr-2" /> 导入
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <CustomScrollArea className="h-full" viewportClassName="reader-scroll" trackOffsetTop="calc(4rem + 20px)" trackOffsetBottom="calc(4.5rem + env(safe-area-inset-bottom, 0px))">
          <div className="container py-6 pb-24 space-y-4">
            <Collapsible title="使用指南" defaultOpen={true}>
              <div className="text-sm leading-relaxed space-y-2 px-1">
                <p>线索集用于把多个剧情的关键段落（你在阅读器中“划线收藏”的段落）汇总在一起，便于复盘与分享。</p>
                <p className="font-medium">推荐用法：</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>在“剧情”中打开某章，右上“书签”开启收藏模式；点击段落右侧书签完成“划线收藏”。</li>
                  <li>在阅读器中对段落“划线收藏”，系统会自动加入默认线索集；无需额外操作。</li>
                  <li>也可在此页为某个线索集点击“从划线导入”，一次性导入你当前设备的所有划线。</li>
                  <li>完成后点击“分享码”复制 AKC1- 开头的分享码，发给他人；对方在此页“粘贴分享码导入”。</li>
                  <li>点击条目的“前往”可一键跳回对应剧情段落（跨版本也能稳定位）。</li>
                </ul>
                <p className="text-xs text-[hsl(var(--color-muted-foreground))]">提示：已加入线索集的划线，会在阅读器“划线收藏”里显示对勾标记；重复导入会自动去重。</p>
              </div>
            </Collapsible>
            {sortedSets.length === 0 && (
              <div className="text-center text-[hsl(var(--color-muted-foreground))]">暂无线索集，先在阅读器中添加或点击上方新建</div>
            )}
            {sortedSets.map((set, idx) => (
              <Collapsible
                key={set.id}
                title={`${set.title}`}
                defaultOpen={idx === 0}
                actions={
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={set.items.length === 0}
                      onClick={() => onReadSet?.(set.id)}
                      aria-label="阅读"
                      title="阅读"
                    >
                      <BookOpen className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={busySetId === set.id}
                      onClick={() => handleExport(set.id)}
                      aria-label="复制分享码"
                      title="复制分享码"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setRenameSetId(set.id);
                        setRenameTitle(set.title);
                        setRenameOpen(true);
                      }}
                      aria-label="重命名"
                      title="重命名"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setDeleteSetId(set.id);
                        setDeleteTitle(set.title);
                        setDeleteOpen(true);
                      }}
                      aria-label="删除"
                      title="删除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                }
              >
                <div className="px-2 pb-2">
                  <div className="text-[10px] text-[hsl(var(--color-muted-foreground))] mb-2">
                    {new Date(set.updatedAt).toLocaleString()} · {set.items.length} 条
                  </div>
                  {set.items.length === 0 && (
                    <div className="text-xs text-[hsl(var(--color-muted-foreground))]">暂无条目</div>
                  )}

                  {/* 以关卡为单位分组展示 */}
                  {(() => {
                    const annotated = set.items.map((it, idx) => ({ ...it, __index: idx }));
                    const order: string[] = [];
                    const groups = new Map<string, typeof annotated>();
                    annotated.forEach((row) => {
                      if (!groups.has(row.storyId)) {
                        groups.set(row.storyId, [] as any);
                        order.push(row.storyId);
                      }
                      groups.get(row.storyId)!.push(row);
                    });

                    return order.map((sid, groupIndex) => {
                      // 组内严格按原文顺序（segmentIndex 升序）
                      const group = [...(groups.get(sid)!)].sort((a, b) => (a.segmentIndex - b.segmentIndex));
                      const story = storyCache[sid];
                      const canGroupUp = groupIndex > 0;
                      const canGroupDown = groupIndex < order.length - 1;

                      const moveGroup = (direction: 'up' | 'down') => {
                        const newOrder = [...order];
                        const curr = groupIndex;
                        const target = direction === 'up' ? curr - 1 : curr + 1;
                        if (target < 0 || target >= newOrder.length) return;
                        const tmp = newOrder[curr];
                        newOrder[curr] = newOrder[target];
                        newOrder[target] = tmp;
                        // 重建 items 按新顺序
                        const flat: typeof set.items = [] as any;
                        newOrder.forEach((oid) => {
                          const g = groups.get(oid)!;
                          g.forEach((row) => flat.push({ storyId: row.storyId, segmentIndex: row.segmentIndex, preview: row.preview, digestHex: row.digestHex, createdAt: row.createdAt } as any));
                        });
                        setItems(set.id, flat as any);
                      };
                      return (
                        <div key={`group-${sid}`} className="mb-4">
                          <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                            <span>{story ? story.storyName : sid}</span>
                            <span className="text-xs text-[hsl(var(--color-muted-foreground))]">{group.length} 条</span>
                            <div className="flex-1" />
                            <Button variant="outline" size="icon" disabled={!canGroupUp} onClick={() => moveGroup('up')} title="上移关卡" aria-label="上移关卡">
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="icon" disabled={!canGroupDown} onClick={() => moveGroup('down')} title="下移关卡" aria-label="下移关卡">
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="divide-y">
                            {group.map((row, pos) => {
                              return (
                                <div key={`${row.storyId}-${row.segmentIndex}-${(row as any).__index ?? pos}`} className="py-3 flex items-center gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs text-[hsl(var(--color-muted-foreground))] truncate">段落 #{row.segmentIndex}</div>
                                    {row.preview && (
                                      <div className="text-sm truncate">{row.preview}</div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={() => handleOpen(row.storyId, row.segmentIndex, row.digestHex, row.preview)}>
                                      前往
                                    </Button>
                                    <Button variant="outline" size="icon" title="移除" onClick={() => removeItem(set.id, row.storyId, row.segmentIndex)}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </Collapsible>
            ))}
          </div>
        </CustomScrollArea>
      </main>

      {renameOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setRenameOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">重命名线索集</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input value={renameTitle} onChange={(e) => setRenameTitle(e.target.value)} placeholder="输入新的线索集名称" />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setRenameOpen(false)}>取消</Button>
                  <Button onClick={() => {
                    if (!renameSetId) return;
                    const title = renameTitle.trim();
                    if (!title) return;
                    renameSet(renameSetId, title);
                    setRenameOpen(false);
                    setRenameSetId(null);
                    setRenameTitle("");
                  }}>保存</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {deleteOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setDeleteOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">确认删除</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm">确定要删除线索集“{deleteTitle}”吗？此操作不可撤销。</div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDeleteOpen(false)}>取消</Button>
                  <Button onClick={() => {
                    if (!deleteSetId) return;
                    deleteSet(deleteSetId);
                    setDeleteOpen(false);
                    setDeleteSetId(null);
                    setDeleteTitle("");
                    setMessage("已删除线索集");
                    setTimeout(() => setMessage(null), 1200);
                  }}>删除</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
