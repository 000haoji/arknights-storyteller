import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReadingProgress } from './useReadingProgress';

describe('useReadingProgress', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('应该为新故事返回 null 进度', () => {
    const { result } = renderHook(() => 
      useReadingProgress('story-001', 'path/to/story.txt')
    );
    
    expect(result.current.progress).toBeNull();
  });

  it('应该保存并恢复滚动模式进度', () => {
    const { result } = renderHook(() => 
      useReadingProgress('story-001', 'path/to/story.txt')
    );
    
    act(() => {
      result.current.updateProgress({
        readingMode: 'scroll',
        scrollTop: 500,
        percentage: 0.5,
        updatedAt: Date.now(),
      });
    });
    
    expect(result.current.progress).toMatchObject({
      readingMode: 'scroll',
      scrollTop: 500,
      percentage: 0.5,
    });
  });

  it('应该保存并恢复分页模式进度', () => {
    const { result } = renderHook(() => 
      useReadingProgress('story-002', 'path/to/story2.txt')
    );
    
    act(() => {
      result.current.updateProgress({
        readingMode: 'paged',
        currentPage: 5,
        percentage: 0.6,
        updatedAt: Date.now(),
      });
    });
    
    expect(result.current.progress).toMatchObject({
      readingMode: 'paged',
      currentPage: 5,
      percentage: 0.6,
    });
  });

  it('应该使用 storyId 作为主键，避免 storyPath 冲突', () => {
    // 两个不同故事共享同一 storyPath（复用文本）
    const { result: result1 } = renderHook(() => 
      useReadingProgress('story-A', 'shared/path.txt')
    );
    
    act(() => {
      result1.current.updateProgress({
        readingMode: 'scroll',
        scrollTop: 100,
        percentage: 0.2,
        updatedAt: Date.now(),
      });
    });
    
    const { result: result2 } = renderHook(() => 
      useReadingProgress('story-B', 'shared/path.txt')
    );
    
    act(() => {
      result2.current.updateProgress({
        readingMode: 'scroll',
        scrollTop: 500,
        percentage: 0.8,
        updatedAt: Date.now(),
      });
    });
    
    // story-A 的进度应该保持不变
    const { result: result1Again } = renderHook(() => 
      useReadingProgress('story-A', 'shared/path.txt')
    );
    
    expect(result1Again.current.progress?.scrollTop).toBe(100);
    expect(result1Again.current.progress?.percentage).toBeCloseTo(0.2);
  });

  it('应该支持清除进度', () => {
    const { result } = renderHook(() => 
      useReadingProgress('story-003', 'path/to/story3.txt')
    );
    
    act(() => {
      result.current.updateProgress({
        readingMode: 'scroll',
        scrollTop: 200,
        percentage: 0.3,
        updatedAt: Date.now(),
      });
    });
    
    expect(result.current.progress).not.toBeNull();
    
    act(() => {
      result.current.clearProgress();
    });
    
    expect(result.current.progress).toBeNull();
  });

  it('应该兼容旧版本的 storyPath 键', () => {
    // 模拟旧版本数据
    const legacyData = {
      'old/path/story.txt': {
        storyPath: 'old/path/story.txt',
        percentage: 0.7,
        scrollTop: 800,
        readingMode: 'scroll',
        updatedAt: Date.now(),
      },
    };
    localStorage.setItem('reading-progress', JSON.stringify(legacyData));
    
    const { result } = renderHook(() => 
      useReadingProgress('story-old', 'old/path/story.txt')
    );
    
    // 应该能读取旧版本数据
    expect(result.current.progress?.percentage).toBeCloseTo(0.7);
    expect(result.current.progress?.scrollTop).toBe(800);
  });
});

