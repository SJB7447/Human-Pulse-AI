import type { Express } from "express";
import { createServer, type Server } from "http";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { storage } from "./storage";
import { emotionTypes, type EmotionType } from "../shared/schema";
import {
  type InteractiveArticle,
  type InteractiveGenerationInput,
  type StoryBlockIntent,
  validateInteractiveArticle,
} from "../shared/interactiveArticle";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const parseRetryAfterSeconds = (value: unknown): number | undefined => {
    if (typeof value !== "string" || !value.trim()) return undefined;
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return Math.max(0, Math.round(asNumber));
    }
    const asDateMs = Date.parse(value);
    if (Number.isNaN(asDateMs)) return undefined;
    const deltaSeconds = Math.round((asDateMs - Date.now()) / 1000);
    return deltaSeconds > 0 ? deltaSeconds : 0;
  };

  const getErrorInfo = (error: any): { status?: number; retryAfterSeconds?: number; message: string } => {
    const status =
      typeof error?.status === "number"
        ? error.status
        : typeof error?.statusCode === "number"
          ? error.statusCode
          : typeof error?.response?.status === "number"
            ? error.response.status
            : undefined;

    const retryAfterSeconds = parseRetryAfterSeconds(
      error?.response?.headers?.get?.("retry-after")
      || error?.response?.headers?.["retry-after"]
      || error?.headers?.["retry-after"]
      || error?.retryAfter
      || error?.retryAfterSeconds
    );

    return {
      status,
      retryAfterSeconds,
      message: String(error?.message || "Unknown Gemini error"),
    };
  };

  const isRetriableGeminiError = (error: any): boolean => {
    const info = getErrorInfo(error);
    if (info.status === 503 || info.status === 504 || info.status === 408 || info.status === 429) {
      return true;
    }
    return /(?:timeout|timed out|deadline|unavailable|high demand|econnreset|etimedout|socket hang up)/i.test(info.message);
  };

  async function withBackoffRetry<T>(
    operation: () => Promise<T>,
    {
      maxRetries = 5,
      baseDelayMs = 800,
      maxDelayMs = 10000,
    }: {
      maxRetries?: number;
      baseDelayMs?: number;
      maxDelayMs?: number;
    } = {}
  ): Promise<T> {
    let attempt = 0;
    let lastError: any;
    while (attempt <= maxRetries) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        if (!isRetriableGeminiError(error) || attempt >= maxRetries) {
          throw error;
        }

        const { retryAfterSeconds } = getErrorInfo(error);
        const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * (2 ** attempt));
        const jitter = Math.floor(Math.random() * Math.max(200, Math.round(exponentialDelay * 0.25)));
        const waitMs = retryAfterSeconds !== undefined
          ? Math.min(maxDelayMs, retryAfterSeconds * 1000) + jitter
          : exponentialDelay + jitter;

        await sleep(waitMs);
        attempt += 1;
      }
    }
    throw lastError;
  }

  app.get("/api/emotions", async (_req, res) => {
    const emotions = emotionTypes.map(type => ({
      type,
      label: type.charAt(0).toUpperCase() + type.slice(1),
      color: getEmotionColor(type),
    }));
    res.json(emotions);
  });

  app.get("/api/news", async (req, res) => {
    const includeHidden = req.query.all === 'true';
    const news = await storage.getAllNews(includeHidden);
    res.json(news);
  });

  app.get("/api/news/:emotion", async (req, res) => {
    const emotion = req.params.emotion as EmotionType;

    if (!emotionTypes.includes(emotion)) {
      return res.status(400).json({ error: "Invalid emotion type" });
    }

    const news = await storage.getNewsByEmotion(emotion);
    res.json(news);
  });

  const sendAiError = (res: any, error: any) => {
    const errorInfo = getErrorInfo(error);
    const overloaded = isRetriableGeminiError(error);
    return res.status(overloaded ? 503 : 500).json({
      error: overloaded
        ? "AI 서버 요청이 일시적으로 많습니다. 잠시 후 다시 시도해주세요."
        : error?.message || "AI Service Error",
      code: overloaded ? "AI_TEMPORARILY_UNAVAILABLE" : "AI_INTERNAL_ERROR",
      retryable: overloaded,
      retryAfterSeconds: errorInfo.retryAfterSeconds,
    });
  };


  // AI Service Methods
  const getGenAI = () => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Error: GEMINI_API_KEY is not set in environment variables.");
      throw new Error("Server Error: AI Service not configured (Missing API Key)");
    }
    // console.log("AI Service Initialized with Key starting:", apiKey.substring(0, 4) + "...");
    return new GoogleGenerativeAI(apiKey);
  };

  // Helper for JSON generation
  async function generateJSON(modelName: string, prompt: string, fallbackModelName?: string) {
    const genAI = getGenAI();
    const modelCandidates = fallbackModelName ? [modelName, fallbackModelName] : [modelName];
    let lastError: any;

    for (const candidateModel of modelCandidates) {
      try {
        const model = genAI.getGenerativeModel({ model: candidateModel });
        const result = await withBackoffRetry(() => model.generateContent(prompt));
        const text = result.response.text().replace(/```json|```/g, '').trim();
        return JSON.parse(text);
      } catch (error: any) {
        lastError = error;
        const errorInfo = getErrorInfo(error);
        if (!isRetriableGeminiError(error)) {
          throw error;
        }
        console.warn(`[AI] Model ${candidateModel} exhausted retries: ${errorInfo.message}`);
      }
    }

    throw lastError;
  }

  const REQUIRED_INTENTS: StoryBlockIntent[] = [
    "intro",
    "context",
    "tension",
    "interpretation",
    "closure",
  ];

  const normalizeInteractiveArticle = (
    article: any,
    input: InteractiveGenerationInput
  ): InteractiveArticle => {
    const blocks = Array.isArray(article?.storyBlocks) ? article.storyBlocks : [];
    const normalizedBlocks = blocks.map((b: any, idx: number) => ({
      id: typeof b?.id === "string" && b.id.trim() ? b.id.trim() : `b${idx + 1}`,
      intent: REQUIRED_INTENTS.includes(b?.intent) ? b.intent : REQUIRED_INTENTS[Math.min(idx, REQUIRED_INTENTS.length - 1)],
      text: typeof b?.text === "string" ? b.text.trim() : "",
    }));

    const fallbackBlocks =
      normalizedBlocks.length >= 5
        ? normalizedBlocks
        : REQUIRED_INTENTS.map((intent, idx) => ({
            id: `b${idx + 1}`,
            intent,
            text: normalizedBlocks[idx]?.text || `${input.keywords[0] || "주요 이슈"} - ${intent} 정보 블록`,
          }));

    const buildEvenScrollMap = () =>
      fallbackBlocks.map((b: any, idx: number) => {
        const size = 100 / Math.max(fallbackBlocks.length, 1);
        return {
          blockId: b.id,
          start: Math.round(idx * size),
          end: Math.round((idx + 1) * size),
        };
      });

    const candidateScrollMap = Array.isArray(article?.scrollMap) ? article.scrollMap : [];
    const blockIds = new Set(fallbackBlocks.map((b: any) => b.id));
    const hasValidCandidateScrollMap =
      candidateScrollMap.length === fallbackBlocks.length &&
      candidateScrollMap.every((m: any) =>
        blockIds.has(m?.blockId) &&
        typeof m?.start === "number" &&
        typeof m?.end === "number" &&
        m.start >= 0 &&
        m.end <= 100 &&
        m.start < m.end
      );

    const safeScrollMap = hasValidCandidateScrollMap ? candidateScrollMap : buildEvenScrollMap();

    const intentCoverage = REQUIRED_INTENTS.reduce((acc, intent) => {
      acc[intent] = fallbackBlocks.some((b: any) => b.intent === intent);
      return acc;
    }, {} as Record<StoryBlockIntent, boolean>);

    const topic = Array.isArray(input.keywords) ? input.keywords.join(", ") : "";

    return {
      specVersion: "interactive-generation.v1",
      articleMeta: {
        title: article?.articleMeta?.title || `${topic} 인터랙티브 기사`,
        subtitle: article?.articleMeta?.subtitle,
        topic,
        tone: input.tone,
        targetAudience: input.targetAudience,
        platform: input.platform,
        interactionIntensity: input.interactionIntensity,
      },
      storyBlocks: fallbackBlocks,
      scrollMap: safeScrollMap,
      highlights:
        Array.isArray(article?.highlights) && article.highlights.length > 0
          ? article.highlights
          : [
              {
                id: "h1",
                blockId: fallbackBlocks[0]?.id || "b1",
                type: "issue",
                label: "핵심 이슈",
                anchorText: input.keywords[0] || "핵심",
                payload: { summary: `${input.keywords[0] || "주요 주제"} 관련 핵심 맥락` },
              },
            ],
      interactionHints: Array.isArray(article?.interactionHints) ? article.interactionHints : [],
      qualityMeta: {
        intentCoverage,
        readabilitySafe: article?.qualityMeta?.readabilitySafe !== false,
        immersionSafe: article?.qualityMeta?.immersionSafe !== false,
        highlightDensity:
          typeof article?.qualityMeta?.highlightDensity === "number"
            ? article.qualityMeta.highlightDensity
            : Number((Array.isArray(article?.highlights) ? article.highlights.length : 1) / Math.max(fallbackBlocks.length, 1)),
        validationPassed: false,
        notes:
          typeof article?.qualityMeta?.notes === "string"
            ? article.qualityMeta.notes
            : "Normalized by server",
      },
    };
  };

  const buildInteractivePrompt = (input: InteractiveGenerationInput) => {
    const minBlocks = Math.max(input.constraints?.minBlocks || 5, 5);
    const maxCharsPerBlock = input.constraints?.maxCharsPerBlock || 280;

    return `
You are generating an Interactive Article JSON, NOT plain text and NOT HTML.
Return ONLY valid JSON, no markdown.

[Input]
- Keywords: ${input.keywords.join(", ")}
- Tone: ${input.tone}
- Target Audience: ${input.targetAudience}
- Platform: ${input.platform}
- Interaction Intensity: ${input.interactionIntensity}
- Language: ${input.language || "ko-KR"}
- Min story blocks: ${minBlocks}
- Max chars per block text: ${maxCharsPerBlock}

[Mandatory UX Rules]
1) storyBlocks must be scene units and include intents:
   intro, context, tension, interpretation, closure (all required at least once).
2) Total storyBlocks >= ${minBlocks}.
3) Every block must have clear information purpose by intent.
4) highlights must not block core comprehension (supplemental only).
5) interactions must not break immersion.
6) scrollMap must cover 0~100 continuously and map each story block.
7) 3D points are declarative through interactionHints action: cameraMove3d or objectPulse3d.
8) Keep article render-ready for frontend Experience.

[Output JSON Schema]
{
  "specVersion": "interactive-generation.v1",
  "articleMeta": {
    "title": "string",
    "subtitle": "string(optional)",
    "topic": "string",
    "tone": "${input.tone}",
    "targetAudience": "${input.targetAudience}",
    "platform": "${input.platform}",
    "interactionIntensity": "${input.interactionIntensity}"
  },
  "storyBlocks": [
    { "id": "b1", "intent": "intro|context|tension|interpretation|closure", "text": "string <= ${maxCharsPerBlock} chars" }
  ],
  "scrollMap": [
    { "blockId": "b1", "start": 0, "end": 20 }
  ],
  "highlights": [
    { "id": "h1", "blockId": "b1", "type": "issue|emotion", "label": "string", "anchorText": "string", "payload": { "summary": "string" } }
  ],
  "interactionHints": [
    { "id": "i1", "blockId": "b1", "trigger": "scroll|click|hover", "action": "reveal|focus|annotate|cameraMove3d|objectPulse3d", "target": "string", "params": { "at": 20 } }
  ],
  "qualityMeta": {
    "intentCoverage": { "intro": true, "context": true, "tension": true, "interpretation": true, "closure": true },
    "readabilitySafe": true,
    "immersionSafe": true,
    "highlightDensity": 0.0,
    "validationPassed": true,
    "notes": "string"
  }
}
`;
  };

  // 1. Text Analysis & Generation Endpoints

  app.post("/api/ai/generate-news", async (req, res) => {
    try {
      const { emotion } = req.body;
      const prompt = `
            Create 3 unique, realistic Korean news articles for emotion "${emotion}".
            title, summary, content must be written in Korean.
            Return JSON: [ { title, summary, content, source, emotion: "${emotion}", imagePrompt } ]
        `;
      const result = await generateJSON("gemini-3-flash-preview", prompt, "gemini-2.0-flash");
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/generate/interactive-article", async (req, res) => {
    try {
      const {
        keywords,
        tone = "analytical",
        targetAudience = "general readers",
        platform = "web",
        interactionIntensity = "medium",
        language = "ko-KR",
        constraints,
      } = req.body || {};

      if (!Array.isArray(keywords) || keywords.length === 0) {
        return res.status(400).json({ error: "keywords must be a non-empty string array." });
      }

      const sanitizedKeywords = keywords.filter((k: unknown) => typeof k === "string" && k.trim());
      if (sanitizedKeywords.length === 0) {
        return res.status(400).json({ error: "keywords must include at least one non-empty string." });
      }

      const input: InteractiveGenerationInput = {
        keywords: sanitizedKeywords,
        tone,
        targetAudience,
        platform,
        interactionIntensity,
        language,
        constraints,
      };

      const prompt = buildInteractivePrompt(input);
      const generated = await generateJSON("gemini-3-flash-preview", prompt, "gemini-2.0-flash");
      const normalized = normalizeInteractiveArticle(generated, input);
      const validation = validateInteractiveArticle(normalized);

      normalized.qualityMeta.validationPassed = validation.valid;
      if (!validation.valid) {
        normalized.qualityMeta.notes = `Validation issues: ${validation.errors.join("; ")}`;
      }

      res.json(normalized);
    } catch (e: any) {
      return sendAiError(res, e);
    }
  });

  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { message } = req.body;
      const prompt = `
            You are "Pulse Bot", a Color Psychology Counselor.
            User message: "${message}"
            Respond in Korean. Be empathetic. Recommend ONE emotion color (vibrance, immersion, clarity, gravity, serenity) if appropriate.
            Return ONLY JSON: { "text": "...", "recommendation": "vibrance" | null }
        `;
      const result = await generateJSON("gemini-3-flash-preview", prompt, "gemini-2.0-flash");
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/analyze-keyword", async (req, res) => {
    try {
      const { keyword } = req.body;
      const prompt = `
            키워드: "${keyword}".
            한국어 뉴스룸 기자가 바로 쓸 수 있게 트렌드 키워드와 배경을 분석하세요.
            반드시 모든 텍스트를 자연스러운 한국어로 작성하세요. 영어 문장/영어 태그는 금지합니다.
            Return JSON only: { "topics": string[], "context": string }
        `;
      const result = await generateJSON("gemini-3-flash-preview", prompt, "gemini-2.0-flash");
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/generate-draft", async (req, res) => {
    try {
      const { keyword } = req.body;
      const prompt = `
            키워드 "${keyword}"에 대한 한국어 뉴스 기사 초안을 작성해주세요.
            JSON 형식으로 반환: { "title": "한국어 제목", "content": "한국어 기사 내용 (최소 500자)" }
            어조: 전문적, 객관적, 한국 언론 스타일.
            반드시 한국어로만 작성하세요.
        `;
      const result = await generateJSON("gemini-3-flash-preview", prompt, "gemini-2.0-flash");
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/check-grammar", async (req, res) => {
    try {
      const { content } = req.body;
      const prompt = `
            Check Korean grammar/spelling:
            "${content}"
            Return JSON: { "correctedText": string, "errors": { original: string, corrected: string, reason: string }[] }
        `;
      const result = await generateJSON("gemini-3-flash-preview", prompt, "gemini-2.0-flash");
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/generate-hashtags", async (req, res) => {
    try {
      const { content, platforms } = req.body;
      const prompt = `
            Generate 8-10 hashtags for: "${content.substring(0, 500)}".
            Platforms: ${platforms.join(', ')}.
            Return JSON: { "hashtags": string[] }
        `;
      const result = await generateJSON("gemini-3-flash-preview", prompt, "gemini-2.0-flash");
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/optimize-titles", async (req, res) => {
    try {
      const { content, platforms } = req.body;
      const prompt = `
            Generate optimized titles for: "${content.substring(0, 500)}".
            Platforms: ${platforms.join(', ')}.
            Return JSON: { "titles": { "platform": string, "title": string }[] }
        `;
      const result = await generateJSON("gemini-3-flash-preview", prompt, "gemini-2.0-flash");
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/analyze-sentiment", async (req, res) => {
    try {
      const { content } = req.body;
      const prompt = `
            Analyze sentiment distribution: "${content.substring(0, 500)}".
            feedback must be written in Korean.
            Return JSON: { "vibrance": number, "immersion": number, "clarity": number, "gravity": number, "serenity": number, "dominantEmotion": string, "feedback": string }
            dominantEmotion must be one of: vibrance, immersion, clarity, gravity, serenity, spectrum
        `;
      const result = await generateJSON("gemini-3-flash-preview", prompt, "gemini-2.0-flash");
      res.json(result);
    } catch (e: any) {
      return sendAiError(res, e);
    }
  });

  app.post("/api/ai/translate", async (req, res) => {
    try {
      const { text, targetLang = "ko" } = req.body;
      const prompt = `
            Translate the following text to fluent, professional, and journalistic ${targetLang === "ko" ? "Korean" : "English"}.
            Maintain the original tone and intent.
            
            [Target Text]:
            "${text.substring(0, 3000)}"
            
            Return JSON only: { "translatedText": "Translated content here..." }
        `;
      const result = await generateJSON("gemini-3-flash-preview", prompt);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 2. Image Generation Endpoint
  app.post("/api/ai/generate-image", async (req, res) => {
    try {
      const { articleContent, count = 4 } = req.body;
      const genAI = getGenAI();

      let imagePrompt = "";
      let descJson: any = {
        subject: "News event",
        action: "happening",
        setting: "realistic setting",
        lighting: "natural lighting",
        mood: "neutral",
        composition: "wide shot",
        style: "photojournalism"
      };

      try {
        // 1. Generate Description Prompt
        const descModel = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
        const descPrompt = `
              Analyze for AI Image Generation:
              "${articleContent.substring(0, 1000)}"
              Return JSON: { "subject", "action", "setting", "lighting", "mood", "composition", "style" }
          `;

        try {
          const descResult = await descModel.generateContent(descPrompt);
          const text = descResult.response.text();
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            descJson = JSON.parse(jsonMatch[0]);
          }
        } catch (parseError) {
          console.warn("JSON Parse Error (using default):", parseError);
          // Keep default descJson
        }

        // 2. Construct Prompt
        imagePrompt = `
              Subject: ${descJson.subject}. Action: ${descJson.action}. Setting: ${descJson.setting}.
              Lighting: ${descJson.lighting}. Mood: ${descJson.mood}. Composition: ${descJson.composition}. Style: ${descJson.style}.
              Quality: High resolution, photorealistic, cinematic lighting, 8k.
          `.trim();

      } catch (promptGenError) {
        console.error("Prompt Generation Failed (using fallback):", promptGenError);
        // Fallback: Create simple prompt from content
        imagePrompt = `News image depicting: ${articleContent.substring(0, 300)}. High quality, photorealistic, 8k resolution, cinematic lighting, news photography style.`;
      }

      // 3. Generate Images
      const imageModel = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" });
      const imagePromises = Array(count).fill(null).map(() =>
        imageModel.generateContent({ contents: [{ role: "user", parts: [{ text: imagePrompt }] }] })
      );

      const results = await Promise.all(imagePromises);
      const images = [];

      for (const result of results) {
        const parts = result.response.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if ((part as any).inlineData) {
            const d = (part as any).inlineData;
            images.push({
              url: `data:${d.mimeType};base64,${d.data}`,
              description: `Subject: ${descJson.subject}, Mood: ${descJson.mood}`
            });
          }
        }
      }
      res.json({ images });

    } catch (e: any) {
      console.error("Image Gen Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // 3. Video Script Generation (Helper) - Korean prompts matching article
  app.post("/api/ai/generate-video-script", async (req, res) => {
    try {
      const { articleContent, imageDescription } = req.body;
      const prompt = `
            기사 내용을 기반으로 9:16 세로형 숏폼 영상 프롬프트를 생성하세요.
            
            기사 내용:
            "${articleContent.substring(0, 1000)}"
            
            이미지 설명 (있는 경우):
            "${imageDescription || '없음'}"
            
            요구사항:
            1. videoPrompt: 영어로 작성된 Veo AI 영상 생성 프롬프트 (이미지에서 시작하여 자연스럽게 움직이는 영상)
            2. 기사의 핵심 메시지와 감정을 시각적으로 표현
            3. 10-30초 분량에 적합한 간결한 장면 구성
            4. 한국어 자막 텍스트 오버레이 포함 권장
            
            JSON 형식으로 반환:
            { 
              "videoPrompt": "English prompt for Veo AI video generation, describing camera movement, visual style, and scene transitions. Must reference the input image and describe how it animates.",
              "script": "영상 스크립트 (한국어)",
              "scenes": [{ "time": "0-5", "description": "장면 설명", "text": "자막 텍스트" }]
            }
        `;
      const result = await generateJSON("gemini-3-flash-preview", prompt);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ... (Existing Routes) ...

  app.post("/api/ai/generate-video", async (req, res) => {
    try {
      const { prompt, image } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "API key not configured" });
      }

      // Dynamic import for @google/genai
      const { GoogleGenAI } = await import("@google/genai");
      const client = new GoogleGenAI({ apiKey });

      // Determine duration: 10-30 seconds (use 15s for image-to-video, 8s for prompt-only)
      const duration = image ? 15 : 8;

      // Start video generation
      let generateParams: any = {
        model: "veo-3.1-fast-generate-preview",
        prompt: prompt,
        config: {
          aspectRatio: "9:16",
          durationSeconds: duration,
        },
      };

      if (image) {
        // Parse data URI - Veo requires bytesBase64Encoded and mimeType
        const matches = image.match(/^data:(.+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          generateParams.image = {
            bytesBase64Encoded: matches[2],
            mimeType: matches[1]
          };
        } else if (image.startsWith('http')) {
          // If it's a URL, skip image input (Veo may not support URL directly)
          console.log("Image is URL, skipping image input for video generation");
        } else {
          throw new Error("Invalid image format. Expected Data URI or URL.");
        }
      }

      let operation = await client.models.generateVideos(generateParams);

      // Poll until complete (with timeout)
      const maxWaitTime = 5 * 60 * 1000; // 5 minutes
      const startTime = Date.now();

      while (!operation.done) {
        if (Date.now() - startTime > maxWaitTime) {
          return res.status(408).json({ error: "Video generation timed out" });
        }

        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        operation = await client.operations.get({ operation });
      }

      // Get the generated video
      const generatedVideo = operation.response?.generatedVideos?.[0];
      const videoUri = generatedVideo?.video?.uri;

      if (!videoUri) {
        throw new Error("No video URI in response");
      }

      // Append API key to the URL for access
      let finalVideoUrl = videoUri;
      if (apiKey && videoUri.includes('generativelanguage.googleapis.com')) {
        const separator = videoUri.includes('?') ? '&' : '?';
        finalVideoUrl = `${videoUri}${separator}key=${apiKey}`;
      }

      console.log("Video generated successfully:", finalVideoUrl);

      res.json({ success: true, videoUrl: finalVideoUrl, duration: 8, aspectRatio: "9:16" });

    } catch (error: any) {
      console.error("[generate-video] Error:", error);
      res.status(500).json({ error: error.message || "Video generation failed" });
    }
  });

  // Admin Dashboard API
  app.get("/api/admin/stats", async (_req, res) => {
    try {
      const stats = await storage.getAdminStats();
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/admin/reports", async (_req, res) => {
    try {
      const reports = await storage.getReports();
      res.json(reports);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/reports", async (req, res) => {
    try {
      const { articleId, reason } = req.body;
      const report = await storage.createReport(articleId, reason);
      res.status(201).json(report);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Automated News Fetching
  app.post("/api/admin/news/fetch", async (_req, res) => {
    try {
      const { runAutoNewsUpdate } = await import("./services/newsCron");
      const result = await runAutoNewsUpdate();
      res.json(result);
    } catch (e: any) {
      console.error("News Fetch Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Cron Job Endpoint (GET)
  app.get("/api/cron", async (_req, res) => {
    try {
      const { runAutoNewsUpdate } = await import("./services/newsCron");
      const result = await runAutoNewsUpdate();
      res.json({ success: true, data: result });
    } catch (e: any) {
      console.error("Cron Error:", e);
      res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  });

  // 4. Article Management
  app.post("/api/articles", async (req, res) => {
    try {
      const articleData = req.body;
      const newItem = await storage.createNewsItem(articleData);
      res.status(201).json(newItem);
    } catch (e: any) {
      console.error("Article Creation Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/articles/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const updatedItem = await storage.updateNewsItem(id, updates);
      if (!updatedItem) {
        return res.status(404).json({ error: "Article not found" });
      }
      res.json(updatedItem);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/articles/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteNewsItem(id);
      if (!success) {
        return res.status(404).json({ error: "Article not found or could not be deleted" });
      }
      res.sendStatus(204);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/articles", async (req, res) => {
    // Alias for /api/news but maybe with more filters later
    const includeHidden = req.query.all === 'true';
    const news = await storage.getAllNews(includeHidden);
    res.json(news);
  });

  // User Interaction API
  app.post("/api/interact/view/:id", async (req, res) => {
    try {
      await storage.incrementView(req.params.id);
      res.sendStatus(200);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/interact/save/:id", async (req, res) => {
    try {
      const userId = "test-user";
      const saved = await storage.toggleSave(req.params.id, userId);
      res.json({ saved });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return httpServer;
}

function getEmotionColor(emotion: EmotionType): string {
  const colors: Record<EmotionType, string> = {
    vibrance: '#ffd150',
    immersion: '#f4606b',
    clarity: '#3f65ef',
    gravity: '#999898',
    serenity: '#88d84a',
    spectrum: '#1bbca8',
  };
  return colors[emotion];
}
