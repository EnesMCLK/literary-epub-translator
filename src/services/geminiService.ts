
import { GoogleGenAI, HarmCategory, HarmBlockThreshold, GenerateContentResponse, Type } from "@google/genai";
import { UILanguage, UsageStats, BookStrategy, STORAGE_KEY_API } from "../design";
import { getSystemInstruction, getAnalysisPrompt } from "../prompts";
import { STRINGS_LOGS } from "../lang/logs";

function getLogStr(uiLang: string, key: string): string {
  const bundle = STRINGS_LOGS[uiLang] || STRINGS_LOGS['en'];
  return bundle[key] || STRINGS_LOGS['en'][key];
}

export class GeminiTranslator {
  private modelName: string;
  private temperature: number;
  private sourceLanguage: string;
  private targetLanguage: string;
  private cachePrefix = 'lit-v22-'; 
  private bookStrategy: BookStrategy | null = null;
  private usage: UsageStats = {
    promptTokens: 0,
    candidatesTokens: 0,
    totalTokens: 0
  };

  private readonly REQUEST_DELAY_MS = 4500;
  private readonly MAX_CHUNK_LENGTH = 6000; 

  private isPaidTier: boolean;

  constructor(
    temperature: number = 0.3, 
    sourceLanguage: string = 'Auto', 
    targetLanguage: string = 'Turkish',
    modelId: string = 'gemini-2.5-flash',
    isPaidTier: boolean = false
  ) {
    this.temperature = Math.max(0.2, Math.min(0.3, temperature));
    this.sourceLanguage = sourceLanguage;
    this.targetLanguage = targetLanguage;
    this.modelName = modelId;
    this.isPaidTier = isPaidTier;
  }

  private getApiKey(): string {
    if ((window as any).manualApiKey) return (window as any).manualApiKey;
    const stored = localStorage.getItem(STORAGE_KEY_API);
    if (stored) return stored;
    try {
        // @ts-ignore
        const p = typeof process !== 'undefined' ? process : (window as any).process;
        if (p && p.env && p.env.API_KEY) {
            return p.env.API_KEY;
        }
    } catch (e) {}
    try {
        // @ts-ignore
        if (import.meta && import.meta.env && import.meta.env.VITE_API_KEY) {
            // @ts-ignore
            return import.meta.env.VITE_API_KEY;
        }
    } catch (e) {}
    return "AI_BROWSER_PLACEHOLDER_KEY";
  }

  setStrategy(strategy: BookStrategy) {
    this.bookStrategy = strategy;
    if (strategy.detected_creativity_level !== undefined) {
      this.temperature = Math.max(0.2, Math.min(0.3, strategy.detected_creativity_level));
    }
  }

  getUsage(): UsageStats {
    return { ...this.usage };
  }

  private isPaidModel(): boolean {
    return this.isPaidTier;
  }

  private chunkHtmlContent(text: string): string[] {
    if (text.length <= this.MAX_CHUNK_LENGTH) {
      return [text];
    }

    const chunks: string[] = [];
    let currentChunk = '';
    
    // Daha güvenli bölme: Sadece blok etiketlerinin sonundan veya cümle sonu işaretlerinden (nokta, ünlem, soru işareti) sonra boşluk varsa böl.
    // HTML etiketlerinin içini bölmemek için lookahead kullanıyoruz.
    const splitRegex = /(<\/p>|<\/div>|<\/blockquote>|<\/li>|<br\s*\/?>|[.!?]\s+)(?=(?:[^<]*>|[^<>]*$))/g;
    
    let lastIndex = 0;
    let match;

    while ((match = splitRegex.exec(text)) !== null) {
      const segment = text.substring(lastIndex, match.index + match[0].length);
      
      if (currentChunk.length + segment.length > this.MAX_CHUNK_LENGTH && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = segment;
      } else {
        currentChunk += segment;
      }
      lastIndex = match.index + match[0].length;
    }

    const remainder = text.substring(lastIndex);
    if (currentChunk.length + remainder.length > this.MAX_CHUNK_LENGTH && currentChunk.length > 0) {
       chunks.push(currentChunk);
       chunks.push(remainder);
    } else {
       currentChunk += remainder;
       if (currentChunk.trim().length > 0) chunks.push(currentChunk);
    }

    return chunks;
  }

  private isTranslationSuspicious(original: string, translated: string): { suspicious: boolean, reason?: string } {
    const cleanOrig = original.replace(/<[^>]*>/g, ' ').trim();
    const cleanTrans = translated.replace(/<[^>]*>/g, ' ').trim();
    
    if (cleanOrig.length > 5 && (!cleanTrans || cleanTrans.length === 0)) {
         if (/^\d+$/.test(cleanOrig)) return { suspicious: false };
         return { suspicious: true, reason: "EMPTY_OUTPUT" };
    }
    
    const isRef = /^\d+$/.test(cleanOrig) || /^[A-Z0-9\s.]+$/.test(cleanOrig) && cleanOrig.length < 10;
    if (!isRef && cleanOrig.length > 20 && cleanOrig.toLowerCase() === cleanTrans.toLowerCase()) {
         return { suspicious: true, reason: "VERBATIM_COPY" };
    }

    return { suspicious: false };
  }

  private shouldSkipTranslation(snippet: string): boolean {
      const s = snippet.trim();
      if (!s) return true;
      if (/^<img[^>]*>$/.test(s)) return true;
      if (/^<svg[\s\S]*?<\/svg>$/.test(s)) return true;
      if (!s.replace(/&nbsp;/g, '').replace(/<[^>]*>/g, '').trim()) return true;
      
      return false;
  }

  async analyzeBook(
    metadata: any, 
    sampleText: string | undefined, 
    uiLang: UILanguage = 'en', 
    feedback?: string,
    onLog?: (msg: string, type: 'info' | 'warning' | 'error' | 'success') => void
  ): Promise<BookStrategy> {
    const apiKey = this.getApiKey();
    const ai = new GoogleGenAI({ apiKey });
    
    // Fallback to gemini-2.5-flash if current model is paid/custom to avoid costing user tokens for analysis if possible, 
    // or to ensure a stable model for the structured JSON task.
    let analysisModelName = this.modelName;
    const prompt = getAnalysisPrompt(this.sourceLanguage, this.targetLanguage, metadata, uiLang, feedback);
    
    let attempt = 0;
    const baseMaxRetries = 3;

    while (true) {
        try {
            if (apiKey === "AI_BROWSER_PLACEHOLDER_KEY") throw new Error("PLACEHOLDER_KEY");

            const response: GenerateContentResponse = await ai.models.generateContent({
                model: analysisModelName, 
                contents: prompt,
                config: { 
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            genre_en: { type: Type.STRING },
                            tone_en: { type: Type.STRING },
                            author_style_en: { type: Type.STRING },
                            strategy_en: { type: Type.STRING },
                            genre_translated: { type: Type.STRING },
                            tone_translated: { type: Type.STRING },
                            author_style_translated: { type: Type.STRING },
                            strategy_translated: { type: Type.STRING },
                            literary_fidelity_note: { type: Type.STRING },
                            detected_creativity_level: { type: Type.NUMBER }
                        },
                        required: [
                            "genre_en", "tone_en", "author_style_en", "strategy_en",
                            "genre_translated", "tone_translated", "author_style_translated", "strategy_translated",
                            "literary_fidelity_note", "detected_creativity_level"
                        ]
                    },
                    safetySettings: [
                        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                    ]
                }
            });

            if (response.usageMetadata) {
                this.usage.promptTokens += response.usageMetadata.promptTokenCount || 0;
                this.usage.candidatesTokens += response.usageMetadata.candidatesTokenCount || 0;
                this.usage.totalTokens += response.usageMetadata.totalTokenCount || 0;
            }

            let jsonStr = response.text || '{}';
            const markdownMatch = jsonStr.match(/```json\s*([\s\S]*?)\s*```/);
            if (markdownMatch) {
                jsonStr = markdownMatch[1];
            } else {
                const firstBrace = jsonStr.indexOf('{');
                const lastBrace = jsonStr.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1) {
                    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
                }
            }
            
            return JSON.parse(jsonStr);

        } catch (err: any) {
            console.warn(`Analysis attempt ${attempt + 1} failed with model ${analysisModelName}:`, err);
            
            const msg = (err.message || "").toLowerCase();
            const isQuota = msg.includes('429') || msg.includes('quota') || msg.includes('resource exhausted');
            const isNotFound = msg.includes('404') || msg.includes('not found') || msg.includes('unsupported model');
            const isAuthError = msg.includes('403') || msg.includes('api key') || msg.includes('permission denied');
            const isPlaceholder = msg.includes('placeholder_key');
            
            if (isAuthError) {
                console.error("Authentication failed. Aborting analysis.");
                if (onLog) onLog(getLogStr(uiLang, 'error').replace('{0}', 'Authentication failed.'), 'error');
                break;
            }

            if (isPlaceholder) {
                 console.error("No API Key provided.");
                 if (onLog) onLog(getLogStr(uiLang, 'error').replace('{0}', 'No API Key provided.'), 'error');
                 break;
            }

            const currentMaxRetries = isQuota ? 5 : baseMaxRetries;
            
            attempt++;
            
            if (attempt > currentMaxRetries) {
                 console.error("All analysis attempts failed.");
                 if (onLog) onLog(getLogStr(uiLang, 'error').replace('{0}', 'All analysis attempts failed.'), 'error');
                 break;
            }

            // If 404 (model not found) and we aren't already on the stable fallback, switch to it.
            if ((isNotFound || msg.includes('500') || msg.includes('internal')) && analysisModelName !== 'gemini-2.5-flash') {
                console.log("Downgrading analysis model to gemini-2.5-flash for stability.");
                if (onLog) onLog(getLogStr(uiLang, 'error').replace('{0}', 'Model error. Downgrading to gemini-2.5-flash...'), 'warning');
                analysisModelName = 'gemini-2.5-flash';
                attempt = 0; 
                continue; 
            }

            if (isQuota) {
                const waitTime = 2000 * Math.pow(2, attempt); 
                console.log(`Quota hit during analysis. Waiting ${waitTime}ms...`);
                if (onLog) onLog(getLogStr(uiLang, 'quotaExceeded'), 'warning');
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }

            if (onLog) onLog(getLogStr(uiLang, 'error').replace('{0}', err.message), 'warning');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    return { 
        genre_en: "Literature", tone_en: "Narrative", author_style_en: "Fluid", strategy_en: "Fidelity",
        genre_translated: "Edebiyat", tone_translated: "Anlatı", author_style_translated: "Akıcı", strategy_translated: "Sadakat",
        literary_fidelity_note: "Analysis failed due to network/quota. Using standard literary strategy.", detected_creativity_level: 0.3,
        isFallback: true 
    };
  }

  private generateHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    const prefix = str.substring(0, 15).replace(/[^a-zA-Z0-9]/g, '');
    const suffix = str.substring(str.length - 15).replace(/[^a-zA-Z0-9]/g, '');
    return `${prefix}-${Math.abs(hash).toString(36)}-${str.length.toString(36)}-${suffix}`;
  }

  async translateSingle(htmlSnippet: string, forceRetryMode: boolean = false): Promise<string> {
    const trimmed = htmlSnippet.trim();
    if (!trimmed || this.shouldSkipTranslation(trimmed)) return htmlSnippet;

    const cacheKey = this.cachePrefix + this.generateHash(trimmed);
    if (!forceRetryMode) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) return cached;
    }

    const chunks = this.chunkHtmlContent(trimmed);
    let finalTranslation = "";

    if (this.isPaidModel()) {
        const tasks = chunks.map(async (chunk, i) => {
            if (!chunk.replace(/<[^>]*>/g, '').trim()) {
                return chunk;
            }
            try {
                return await this.translateChunkWithRetry(chunk, forceRetryMode);
            } catch (e) {
                console.error(`Chunk ${i} translation FATAL error on Paid Model.`, e);
                throw e; 
            }
        });
        const results = await Promise.all(tasks);
        finalTranslation = results.join("");
    } else {
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            
            if (!chunk.replace(/<[^>]*>/g, '').trim()) {
                finalTranslation += chunk;
                continue;
            }

            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, this.REQUEST_DELAY_MS));
            }

            try {
                const result = await this.translateChunkWithRetry(chunk, forceRetryMode);
                finalTranslation += result;
            } catch (e) {
                console.warn(`Chunk ${i} translation failed (Free Tier), keeping original.`, e);
                finalTranslation += chunk; 
            }
        }
    }

    if (finalTranslation && finalTranslation !== trimmed) {
        try { localStorage.setItem(cacheKey, finalTranslation); } catch (e) {}
    }

    return finalTranslation;
  }

  private async translateChunkWithRetry(chunk: string, forceRetryMode: boolean): Promise<string> {
    const apiKey = this.getApiKey();
    const ai = new GoogleGenAI({ apiKey });
    const isPaid = this.isPaidModel();
    
    let attempt = 0;
    // Kalite ve kararlılık öncelikli olduğu için hata durumunda deneme sayısını artırıyoruz
    const maxRetries = isPaid ? 5 : 3;

    while (attempt <= maxRetries) {
        try {
            if (apiKey === "AI_BROWSER_PLACEHOLDER_KEY") throw new Error("API_KEY_INVALID");

            const currentTemp = (attempt > 0 || forceRetryMode) ? 0.2 : this.temperature;
            const repairLevel = (attempt > 0) ? 1 : 0;

            const sysInstruction = getSystemInstruction(
                this.sourceLanguage, 
                this.targetLanguage, 
                this.bookStrategy, 
                repairLevel
            );

            const response: GenerateContentResponse = await ai.models.generateContent({
                model: this.modelName,
                contents: chunk,
                config: { 
                    systemInstruction: sysInstruction, 
                    temperature: currentTemp,
                    safetySettings: [
                        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                    ]
                }
            });

            if (response.usageMetadata) {
                this.usage.promptTokens += response.usageMetadata.promptTokenCount || 0;
                this.usage.candidatesTokens += response.usageMetadata.candidatesTokenCount || 0;
                this.usage.totalTokens += response.usageMetadata.totalTokenCount || 0;
            }

            let translated = (response.text || "").trim();
            translated = translated.replace(/^```(html|xhtml|xml)?\n?/i, '').replace(/\n?```$/i, '').trim();

            const check = this.isTranslationSuspicious(chunk, translated);
            if (check.suspicious) {
                throw new Error(`VALIDATION_FAILED_${check.reason}`);
            }

            return translated;

        } catch (error: any) {
            const errMsg = error.message || "";
            if (errMsg === "API_KEY_INVALID") throw error;
            
            attempt++;
            
            if (isPaid) {
                console.warn(`Paid Model Error (Attempt ${attempt}): ${errMsg}. Retrying...`);
                const delay = Math.min(1000 * Math.pow(1.5, attempt), 10000); 
                await new Promise(resolve => setTimeout(resolve, delay));
                continue; 
            } else {
                if (errMsg.includes('429')) {
                    if (attempt <= maxRetries) {
                        console.warn(`Free Tier Quota Hit (Attempt ${attempt}). Waiting 10s...`);
                        await new Promise(resolve => setTimeout(resolve, 10000));
                        continue;
                    } else {
                        throw new Error("API_QUOTA_EXCEEDED");
                    }
                }
                
                if (attempt <= maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                } else {
                    break; 
                }
            }
        }
    }
    
    return chunk;
  }
}
