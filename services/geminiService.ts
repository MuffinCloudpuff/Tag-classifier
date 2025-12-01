import { GoogleGenAI, Type, Schema } from "@google/genai";
import { TabItem, OrganizeResponse } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to generate schema based on depth
const createSchema = (depth: number): Schema => {
  // Base properties for any group node
  const baseGroupProps = {
    groupName: { type: Type.STRING },
    emoji: { type: Type.STRING },
    reasoning: { type: Type.STRING },
    tabIds: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING },
      description: "Directly belonging tab IDs"
    }
  };

  // Level 3 Node (Leaf groups if depth is 3)
  const level3Subgroups = {
    type: Type.ARRAY,
    description: "三级分类 (Level 3)",
    items: {
      type: Type.OBJECT,
      properties: baseGroupProps,
      required: ["groupName", "emoji", "tabIds", "reasoning"]
    }
  };

  // Level 2 Node
  const level2Subgroups = {
    type: Type.ARRAY,
    description: "二级分类 (Level 2)",
    items: {
      type: Type.OBJECT,
      properties: {
        ...baseGroupProps,
        // Only add subgroups if depth is 3
        ...(depth >= 3 ? { subgroups: level3Subgroups } : {})
      },
      required: ["groupName", "emoji", "tabIds", "reasoning"]
    }
  };

  // Root Level Groups (Level 1)
  return {
    type: Type.OBJECT,
    properties: {
      groups: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            ...baseGroupProps,
             // Only add subgroups if depth is >= 2
            ...(depth >= 2 ? { subgroups: level2Subgroups } : {})
          },
          required: ["groupName", "emoji", "tabIds", "reasoning"]
        }
      }
    },
    required: ["groups"]
  };
};

export const organizeTabsWithGemini = async (tabs: TabItem[], depth: number = 2): Promise<OrganizeResponse> => {
  if (tabs.length === 0) {
    return { groups: [] };
  }

  // Create a simplified list for the prompt
  const simpleList = tabs.map(t => ({
    id: t.id,
    title: t.title,
    url: t.url
  }));

  let depthInstruction = "";
  if (depth === 1) {
    depthInstruction = `
    - **结构深度**：仅使用 **1 级** 扁平分类。
    - 不要创建子文件夹。
    - 直接将所有标签归类到主要的顶级类别中（例如："技术", "购物", "新闻"）。`;
  } else if (depth === 2) {
    depthInstruction = `
    - **结构深度**：使用 **2 级** 嵌套结构。
    - 一级为大类（如“技术开发”），二级为子类（如“前端”、“后端”）。
    - 尽量将标签放入二级子类中，保持整洁。`;
  } else {
    depthInstruction = `
    - **结构深度**：使用 **3 级** 深度结构。
    - 一级(领域) -> 二级(方向) -> 三级(具体技术/项目)。
    - 适合复杂的知识库整理。`;
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: JSON.stringify(simpleList),
    config: {
      systemInstruction: `你是一位专业的浏览器标签页整理专家。
      你的目标是将提供的标签页列表整理成具有层级结构的文件夹。
      
      核心配置：用户指定了分类深度为 **${depth} 层**。
      
      规则：
      1. **分类逻辑**：
         - 先识别整体领域，再根据深度要求细分。
         - 确保所有 ID 都被分配。
         - 组名简短精炼（2-6个中文字符）。
      
      ${depthInstruction}
      
      3. **Strict JSON**：严格按照 Schema 返回 JSON 数据。`,
      responseMimeType: "application/json",
      responseSchema: createSchema(depth)
    }
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini 没有返回任何内容");
  }

  try {
    const data = JSON.parse(text) as OrganizeResponse;
    return data;
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    throw new Error("无法解析 AI 返回的数据");
  }
};