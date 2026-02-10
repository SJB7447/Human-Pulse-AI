export interface GeneratedNews {
    title: string;
    summary: string;
    content: string;
    source: string;
    emotion: string;
    imagePrompt: string;
}

// Helper for API calls
async function callApi(endpoint: string, body: any) {
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    let data;
    const text = await res.text();
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw new Error(`Server returned non-JSON response: ${text.substring(0, 100)}...`);
    }

    if (!res.ok) {
        throw new Error(data.error || 'AI Service Error');
    }

    return data;
}

export const GeminiService = {
    async generateNewsForEmotion(emotion: string): Promise<GeneratedNews[]> {
        return callApi('/api/ai/generate-news', { emotion });
    },

    async chatWithBot(message: string): Promise<{ text: string, recommendation?: string }> {
        try {
            return await callApi('/api/ai/chat', { message });
        } catch (e) {
            return { text: "죄송합니다. AI 연결에 문제가 있어 대답할 수 없습니다." };
        }
    },

    async analyzeKeyword(keyword: string): Promise<{ topics: string[]; context: string }> {
        return callApi('/api/ai/analyze-keyword', { keyword });
    },

    async generateArticleDraft(keyword: string): Promise<{ title: string; content: string }> {
        return callApi('/api/ai/generate-draft', { keyword });
    },

    async checkGrammar(content: string): Promise<{ correctedText: string; errors: { original: string; corrected: string; reason: string }[] }> {
        return callApi('/api/ai/check-grammar', { content });
    },

    async generateHashtags(content: string, platforms: string[]): Promise<{ hashtags: string[] }> {
        return callApi('/api/ai/generate-hashtags', { content, platforms });
    },

    async optimizeTitles(content: string, platforms: string[]): Promise<{ titles: { platform: string; title: string }[] }> {
        return callApi('/api/ai/optimize-titles', { content, platforms });
    },

    async generateImage(articleContent: string, count: number = 4): Promise<{ images: { url: string; description: string }[] }> {
        return callApi('/api/ai/generate-image', { articleContent, count });
    },

    async generateShortVideo(articleContent: string, imageUrl?: string, imageDescription?: string): Promise<{ videoUrl: string; script: string }> {
        // 1. Get Script via AI endpoint
        const scriptJson = await callApi('/api/ai/generate-video-script', { articleContent, imageDescription });

        // 2. Generate Video via Veo endpoint
        // Note: '/api/generate-video' is the existing Veo endpoint
        const videoRes = await fetch('/api/generate-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: scriptJson.videoPrompt,
                image: imageUrl
            })
        });

        const videoResult = await videoRes.json();
        if (!videoRes.ok) throw new Error(videoResult.error || 'Video generation failed');

        return {
            videoUrl: videoResult.videoUrl,
            script: JSON.stringify(scriptJson, null, 2)
        };
    },

    async analyzeSentiment(content: string): Promise<{
        vibrance: number; immersion: number; clarity: number; gravity: number; serenity: number;
        dominantEmotion: string; feedback: string;
    }> {
        if (!content.trim()) {
            return {
                vibrance: 20, immersion: 20, clarity: 20, gravity: 20, serenity: 20,
                dominantEmotion: 'spectrum',
                feedback: '기사 내용을 입력해주세요.'
            };
        }
        return callApi('/api/ai/analyze-sentiment', { content });
    },

    async translateText(text: string, targetLang: string = 'ko'): Promise<{ translatedText: string }> {
        return callApi('/api/ai/translate', { text, targetLang });
    }
};
