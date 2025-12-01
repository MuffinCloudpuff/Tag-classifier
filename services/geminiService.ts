import { GoogleGenAI, Type, Schema, HarmCategory, HarmBlockThreshold } from "@google/genai";
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
    - 必须基于“用户意图”进行宏观归类（如“个人成长”、“工作生产力”、“生活娱乐”）。`;
  } else if (depth === 2) {
    depthInstruction = `
    - **结构深度**：使用 **2 级** 嵌套结构。
    - 一级为“行为动机”（如“技术开发”、“学习提升”），二级为“具体领域”（如“前端工具”、“数学/数电”）。`;
  } else {
    depthInstruction = `
    - **结构深度**：使用 **3 级** 深度结构。
    - 一级(动机/场景) -> 二级(领域) -> 三级(具体项目/技术)。`;
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      role: 'user',
      parts: [{
        text: `Please organize the following ${simpleList.length} browser tabs into logical groups according to the system instructions.\n\nJSON Data:\n${JSON.stringify(simpleList)}`
      }]
    },
    config: {
      systemInstruction: `你是一位结合了**认知心理学**与**知识管理学**的高级整理专家。
      你的任务不仅仅是看关键词分类，而是分析用户保存该网页背后的**行为动机 (User Intent)** 和 **心理诉求**。

      ### 核心分析逻辑 (Psychological Profiling)：
      不要只看表面标题，要问自己：“用户为什么要保存这个？”

      1. **学习与自我提升 (Learning & Growth)**
         - 标志：教程、课程、基础理论、学术概念、考试资料。
         - *案例*：即使标题含“电子”，如果是“数字电路基础”或“大学课件”，它是**学习资料**，应归入【学习/教育】或【知识库】，而不是“硬科技”。
      
      2. **工作与生产力 (Productivity & Development)**
         - 标志：工具文档、GitHub 库、API 参考、SaaS 工具、解决方案。
         - *案例*：“机器人视觉算法”、“OpenCV文档”是用来**干活/开发**的，应归入【技术开发】或【AI工具】，因为这是生产力场景。

      3. **资源与素材 (Resources & Assets)**
         - 标志：图片素材、字体下载、配色网、模型库。
         - 归类为【设计资源】或【素材库】。

      4. **生活与娱乐 (Life & Entertainment)**
         - 标志：购物、游戏、视频、社交、新闻。

      ### 修正规则 (Correction Rules)：
      - **纠正**：不要把“数电/模电”放在“科技新闻”或“硬件产品”里，它们通常是用户的【学习资料】。
      - **纠正**：不要把“AI 绘图工具”放在“艺术欣赏”里，它是【生产力工具】。
      
      ### 结构要求：
      - 核心配置：用户指定了分类深度为 **${depth} 层**。
      ${depthInstruction}
      - 确保所有 ID 都被分配，不要遗漏。
      - 组名简短精炼，直击用户意图（2-6个中文字符）。
      
      Strictly follow the JSON schema provided.`,
      responseMimeType: "application/json",
      responseSchema: createSchema(depth),
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    }
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini 没有返回任何内容。可能是因为输入内容包含了被安全过滤器拦截的敏感词汇，或者模型暂时繁忙。");
  }

  try {
    const data = JSON.parse(text) as OrganizeResponse;
    return data;
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    throw new Error("无法解析 AI 返回的数据");
  }
};
