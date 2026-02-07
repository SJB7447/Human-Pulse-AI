import type { Express } from "express";
import { createServer, type Server } from "http";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { storage } from "./storage";
import { emotionTypes, type EmotionType } from "../shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/emotions", async (_req, res) => {
    const emotions = emotionTypes.map(type => ({
      type,
      label: type.charAt(0).toUpperCase() + type.slice(1),
      color: getEmotionColor(type),
    }));
    res.json(emotions);
  });

  app.get("/api/news", async (_req, res) => {
    const news = await storage.getAllNews();
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
  async function generateJSON(modelName: string, prompt: string) {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  }

  // 1. Text Analysis & Generation Endpoints

  app.post("/api/ai/generate-news", async (req, res) => {
    try {
      const { emotion } = req.body;
      const prompt = `
            Create 3 unique, realistic news headlines for emotion "${emotion}".
            Return JSON: [ { title, summary, content, source, emotion: "${emotion}", imagePrompt } ]
        `;
      const result = await generateJSON("gemini-3-flash-preview", prompt);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { message } = req.body;
      const prompt = `
            You are "Pulse Bot", a Color Psychology Counselor.
            User message: "${message}"
            Respond in Korean. Be empathetic. Recommend ONE emotion color (joy, anger, sadness, fear, calm) if appropriate.
            Return ONLY JSON: { "text": "...", "recommendation": "joy" | null }
        `;
      const result = await generateJSON("gemini-3-flash-preview", prompt);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/analyze-keyword", async (req, res) => {
    try {
      const { keyword } = req.body;
      const prompt = `
            Keyword: "${keyword}". Analyze trending topics and context.
            Return JSON: { "topics": string[], "context": string }
        `;
      const result = await generateJSON("gemini-3-flash-preview", prompt);
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
      const result = await generateJSON("gemini-3-flash-preview", prompt);
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
      const result = await generateJSON("gemini-3-flash-preview", prompt);
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
      const result = await generateJSON("gemini-3-flash-preview", prompt);
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
      const result = await generateJSON("gemini-3-flash-preview", prompt);
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
            Return JSON: { "joy": number, "anger": number, "sadness": number, "fear": number, "calm": number, "dominantEmotion": string, "feedback": string }
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

      // 1. Generate Description Prompt
      const descModel = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
      const descPrompt = `
            Analyze for AI Image Generation:
            "${articleContent.substring(0, 1000)}"
            Return JSON: { "subject", "action", "setting", "lighting", "mood", "composition", "style" }
        `;
      const descResult = await descModel.generateContent(descPrompt);
      const descJson = JSON.parse(descResult.response.text().replace(/```json|```/g, '').trim());

      // 2. Construct Prompt
      const imagePrompt = `
            Subject: ${descJson.subject}. Action: ${descJson.action}. Setting: ${descJson.setting}.
            Lighting: ${descJson.lighting}. Mood: ${descJson.mood}. Composition: ${descJson.composition}. Style: ${descJson.style}.
            Quality: High resolution, photorealistic, cinematic lighting, 8k.
        `.trim();

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

  app.post("/api/generate-video", async (req, res) => {
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
    joy: '#FFD700',
    anger: '#FF4D4D',
    sadness: '#4D96FF',
    fear: '#8E44AD',
    calm: '#2ECC71',
  };
  return colors[emotion];
}
