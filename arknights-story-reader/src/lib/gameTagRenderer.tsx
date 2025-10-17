/**
 * 游戏描述文本标签渲染工具
 * 处理技能、天赋、基建等描述中的富文本标签
 */

interface TagConfig {
  className: string;
  display?: string;
}

// 标签样式映射
const TAG_STYLES: Record<string, TagConfig> = {
  // 战斗标签 (ba = battle)
  "ba.vup": { className: "text-green-400 font-medium", display: "" }, // 数值上升
  "ba.vdown": { className: "text-red-400 font-medium", display: "" }, // 数值下降
  "ba.kw": { className: "text-yellow-400 font-semibold", display: "" }, // 关键词
  "ba.rem": { className: "text-gray-400 text-xs", display: "" }, // 备注
  "ba.enemy": { className: "text-orange-400", display: "" }, // 敌人
  "ba.drop": { className: "text-blue-400", display: "" }, // 掉落
  "ba.talpu": { className: "text-purple-400", display: "" }, // 天赋升级
  "ba.dt.element": { className: "text-cyan-400", display: "" }, // 元素伤害
  
  // 基建标签 (cc = control center)
  "cc.kw": { className: "text-yellow-400 font-semibold", display: "" }, // 关键词
  "cc.vup": { className: "text-green-400 font-medium", display: "" }, // 数值上升
  "cc.vdown": { className: "text-red-400 font-medium", display: "" }, // 数值下降
  "cc.rem": { className: "text-gray-400 text-xs", display: "" }, // 备注
  
  // 变量标签 (xa-xg为变量占位符，通常不显示)
  "ba.xa": { className: "", display: "" },
  "ba.xb": { className: "", display: "" },
  "ba.xc": { className: "", display: "" },
  "ba.xd": { className: "", display: "" },
  "ba.xe": { className: "", display: "" },
  "ba.xf": { className: "", display: "" },
  "ba.xg": { className: "", display: "" },
};

interface TextSegment {
  type: "text" | "tag";
  content: string;
  tagType?: string;
  className?: string;
}

/**
 * 解析包含标签的文本
 */
function parseGameText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const tagStack: string[] = [];
  let currentText = "";
  let i = 0;

  while (i < text.length) {
    if (text[i] === "<") {
      // 保存之前的文本
      if (currentText) {
        const topTag = tagStack[tagStack.length - 1];
        const config = topTag ? TAG_STYLES[topTag] : undefined;
        segments.push({
          type: "text",
          content: currentText,
          className: config?.className,
        });
        currentText = "";
      }

      // 查找标签结束
      const tagEnd = text.indexOf(">", i);
      if (tagEnd === -1) {
        currentText += text[i];
        i++;
        continue;
      }

      const tagContent = text.substring(i + 1, tagEnd);

      // 处理闭合标签 </>
      if (tagContent === "/") {
        tagStack.pop();
        i = tagEnd + 1;
        continue;
      }

      // 处理开启标签 <@ba.xxx> 或 <@cc.xxx>
      if (tagContent.startsWith("@") || tagContent.startsWith("$")) {
        const tagType = tagContent.substring(1); // 去掉 @ 或 $
        tagStack.push(tagType);
        i = tagEnd + 1;
        continue;
      }

      // 其他标签直接忽略
      i = tagEnd + 1;
    } else {
      currentText += text[i];
      i++;
    }
  }

  // 保存剩余文本
  if (currentText) {
    const topTag = tagStack[tagStack.length - 1];
    const config = topTag ? TAG_STYLES[topTag] : undefined;
    segments.push({
      type: "text",
      content: currentText,
      className: config?.className,
    });
  }

  return segments;
}

/**
 * 处理变量占位符 {variable:format}
 * 保留格式信息，让用户知道是什么类型的数值
 */
function processVariables(text: string): string {
  // 保留完整的占位符格式，用户能看到数值类型
  return text.replace(/\{([^}]+)\}/g, (match) => {
    // 直接返回原始格式，保留所有信息
    return match;
  });
}

/**
 * 渲染游戏描述文本（React组件）
 */
export function GameText({ 
  text, 
  className = "", 
  blackboard 
}: { 
  text: string; 
  className?: string;
  blackboard?: Array<{ key: string; value: number }>;
}) {
  if (!text) return null;

  let processedText = text;
  
  // 如果有blackboard，替换变量占位符为实际数值
  if (blackboard && blackboard.length > 0) {
    const valueMap = new Map(blackboard.map(item => [item.key, item.value]));
    
    processedText = text.replace(/\{([^:}]+)(?::([^}]+))?\}/g, (match, varName, format) => {
      const value = valueMap.get(varName);
      if (value !== undefined) {
        // 根据格式化字符串显示数值
        if (format?.includes('%')) {
          return `${(value * 100).toFixed(0)}%`;
        } else if (format?.includes('.')) {
          const decimals = (format.match(/\.(\d+)/) || [])[1]?.length || 1;
          return value.toFixed(decimals);
        } else {
          return value.toString();
        }
      }
      return match; // 找不到值时保留原样
    });
  }

  // 解析标签
  const segments = parseGameText(processedText);

  return (
    <span className={className}>
      {segments.map((segment, idx) => (
        <span key={idx} className={segment.className || ""}>
          {segment.content}
        </span>
      ))}
    </span>
  );
}

/**
 * 纯文本版本（移除所有标签和变量）
 */
export const stripGameTags = (text: string): string => {
  if (!text) return "";
  
  let result = text;
  
  // 移除所有标签
  result = result.replace(/<@[^>]+>/g, "");
  result = result.replace(/<\$[^>]+>/g, "");
  result = result.replace(/<\/>/g, "");
  
  // 简化变量占位符
  result = processVariables(result);
  
  return result;
};

