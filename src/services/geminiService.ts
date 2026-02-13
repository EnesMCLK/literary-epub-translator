import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { UILanguage, UsageStats, BookStrategy, STORAGE_KEY_API } from "../design";
import { getSystemInstruction, getAnalysisPrompt } from "../prompts";

export class GeminiTranslator {
  private modelName: string;
  private temperature: number;
  private sourceLanguage: string;
  private targetLanguage: string;
  private cachePrefix = 'lit-v22-'; // Cache version bumped
  private bookStrategy: BookStrategy | null = null;
  private usage: UsageStats = {
    promptTokens: 0,
    candidatesTokens: 0,
    totalTokens: 0
  };

  // 15 Requests Per Minute = 1 request every 4 seconds. 
  // We use 4100ms to be safe against network jitter.
  private readonly REQUEST_DELAY_MS = 4100;
  private readonly MAX_CHUNK_LENGTH = 3500; // ~3500 chars is safe for chunks

  constructor(
    temperature: number = 0.3, 
    sourceLanguage: string = 'Auto', 
    targetLanguage: string = 'Turkish',
    modelId: string = 'gemini-2.0-flash'
  ) {
    this.temperature = temperature;
    this.sourceLanguage = sourceLanguage;
    this.targetLanguage = targetLanguage;
    this.modelName = modelId;
  }

  private getApiKey(): string {
    if ((window as any).manualApiKey) return (window as any).manualApiKey;
    const stored = localStorage.getItem(STORAGE_KEY_API);
    if (stored) return stored;
    try {
        // @ts-ignore
        if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
            // @ts-ignore
            return process.env.API_KEY;
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
      this.temperature = strategy.detected_creativity_level;
    }
  }

  getUsage(): UsageStats {
    return { ...this.usage };
  }

  private isPaidModel(): boolean {
    return this.modelName.includes('gemini-3') || this.modelName.includes('pro');
  }

  /**
   * Splits a long HTML string into semantically meaningful chunks.
   * Prioritizes splitting at block tags (</p>, </div>) or sentence endings to avoid breaking context.
   */
  private chunkHtmlContent(text: string): string[] {
    if (text.length <= this.MAX_CHUNK_LENGTH) {
      return [text];
    }

    const chunks: string[] = [];
    let currentChunk = '';
    
    // Regex matches closing tags of blocks or sentence endings followed by space
    // This helps keep HTML valid and context intact.
    const splitRegex = /(<\/p>|<\/div>|<\/blockquote>|<\/li>|<br\s*\/?>|[.!?]\s)(?=(?:[^<]*>|[^<>]*$))/g;
    
    let lastIndex = 0;
    let match;

    while ((match = splitRegex.exec(text)) !== null) {
      const segment = text.substring(lastIndex, match.index + match[0].length);
      
      // If adding this segment exceeds max length, push current chunk and start new
      if (currentChunk.length + segment.length > this.MAX_CHUNK_LENGTH && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = segment;
      } else {
        currentChunk += segment;
      }
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
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
    
    // Verbatim Copy Check
    const isRef = /^\d+$/.test(cleanOrig) || /^[A-Z0-9\s.]+$/.test(cleanOrig) && cleanOrig.length < 10;
    // Eğer içerik çok kısa değilse ve birebir aynısıysa şüpheli say
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
      // Tablo ve kısa linkleri artık atlamıyoruz
      
      // Sadece görünür metni olmayan boş tagleri atla (ör: <p></p> veya <div> </div>)
      if (!s.replace(/&nbsp;/g, '').replace(/<[^>]*>/g, '').trim()) return true;
      
      return false;
  }

  async analyzeBook(
    metadata: any, 
    sampleText: string | undefined, 
    uiLang: UILanguage = 'en', 
    feedback?: string
  ): Promise<BookStrategy> {
    const apiKey = this.getApiKey();
    const ai = new GoogleGenAI({ apiKey });
    
    // Initial Model Selection
    // If user selected a Paid model, try to use it. If not, default to 2.0 Flash.
    let analysisModelName = this.isPaidModel() ? this.modelName : 'gemini-2.0-flash';
    const prompt = getAnalysisPrompt(this.sourceLanguage, this.targetLanguage, metadata, uiLang, feedback);
    
    let attempt = 0;
    // Base max retries
    const baseMaxRetries = 3;

    while (true) {
        try {
            if (apiKey === "AI_BROWSER_PLACEHOLDER_KEY") throw new Error("PLACEHOLDER_KEY");

            const response = await ai.models.generateContent({
                model: analysisModelName, 
                contents: prompt,
                config: { 
                responseMimeType: "application/json",
                // Safety Settings: BLOCK_NONE to ensure literary analysis works on all genres
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
            // Aggressive JSON extraction
            // 1. Try to find markdown block
            const markdownMatch = jsonStr.match(/```json\s*([\s\S]*?)\s*```/);
            if (markdownMatch) {
                jsonStr = markdownMatch[1];
            } else {
                // 2. Try to find first { and last }
                const firstBrace = jsonStr.indexOf('{');
                const lastBrace = jsonStr.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1) {
                    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
                }
            }
            
            return JSON.parse(jsonStr);

        } catch (err: any) {
            console.warn(`Analysis attempt ${attempt + 1} failed with model ${analysisModelName}:`, err);
            
            // Check for specific errors
            const msg = (err.message || "").toLowerCase();
            const isQuota = msg.includes('429') || msg.includes('quota') || msg.includes('resource exhausted');
            const isNotFound = msg.includes('404') || msg.includes('not found') || msg.includes('unsupported model');
            const isAuthError = msg.includes('403') || msg.includes('api key') || msg.includes('permission denied');
            const isPlaceholder = msg.includes('placeholder_key');
            
            // FAIL FAST: If Auth Error, do not retry.
            if (isAuthError) {
                console.error("Authentication failed. Aborting analysis.");
                // Propagate specific error if possible, or fall back immediately
                break;
            }

            if (isPlaceholder) {
                 console.error("No API Key provided.");
                 break;
            }

            // Determine max retries for this error type
            // Quota errors get more chances with backoff
            const currentMaxRetries = isQuota ? 5 : baseMaxRetries;
            
            attempt++;
            
            if (attempt > currentMaxRetries) {
                 console.error("All analysis attempts failed.");
                 break;
            }

            // --- RECOVERY STRATEGIES ---

            // 1. If Paid Model failed with 404/500/NotFound, fallback to Flash immediately
            if ((isNotFound || msg.includes('500') || msg.includes('internal')) && analysisModelName !== 'gemini-2.0-flash') {
                console.log("Downgrading analysis model to gemini-2.0-flash for stability.");
                analysisModelName = 'gemini-2.0-flash';
                // Reset attempt counter when switching models to give it a fair chance
                attempt = 0; 
                continue; 
            }

            // 2. If Quota Exceeded (429), wait with exponential backoff
            if (isQuota) {
                // Backoff: 2s, 4s, 8s, 16s, 32s
                const waitTime = 2000 * Math.pow(2, attempt); 
                console.log(`Quota hit during analysis. Waiting ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }

            // 3. For other errors (e.g. JSON parse error, network blip), small wait and retry
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    // Fallback if all retries fail
    return { 
        genre_en: "Literature", tone_en: "Narrative", author_style_en: "Fluid", strategy_en: "Fidelity",
        genre_translated: "Edebiyat", tone_translated: "Anlatı", author_style_translated: "Akıcı", strategy_translated: "Sadakat",
        literary_fidelity_note: "Analysis failed due to network/quota. Using standard literary strategy.", detected_creativity_level: 0.3,
        isFallback: true 
    };
  }

  async translateSingle(htmlSnippet: string, forceRetryMode: boolean = false): Promise<string> {
    const trimmed = htmlSnippet.trim();
    if (!trimmed || this.shouldSkipTranslation(trimmed)) return htmlSnippet;

    const cacheKey = this.cachePrefix + btoa(encodeURIComponent(trimmed)).substring(0, 32);
    if (!forceRetryMode) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) return cached;
    }

    // Split text into safe chunks
    const chunks = this.chunkHtmlContent(trimmed);
    let finalTranslation = "";

    // Iterate through chunks with Rate Limiting
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        // Skip empty chunks
        if (!chunk.replace(/<[^>]*>/g, '').trim()) {
            finalTranslation += chunk;
            continue;
        }

        // --- RATE LIMITING: ARTIFICIAL DELAY ---
        // If this is not the first chunk, we MUST wait to respect the RPM limit.
        // Paid models don't technically need this delay for rate limits, but it helps avoid flooding.
        if (i > 0 && !this.isPaidModel()) {
            await new Promise(resolve => setTimeout(resolve, this.REQUEST_DELAY_MS));
        }

        try {
            const result = await this.translateChunkWithRetry(chunk, forceRetryMode);
            finalTranslation += result;
        } catch (e) {
            // CRITICAL CHANGE: For Paid Models, translateChunkWithRetry loops forever.
            // If we catch an error here, it means something fatal happened (like API Key invalid).
            // For Free models, it might be a skip.
            if (this.isPaidModel()) {
                 console.error(`Chunk ${i} translation FATAL error on Paid Model.`, e);
                 throw e; // Stop the whole process if paid model fails fatally
            } else {
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
    // For paid models, maxRetries is effectively infinite. For free, it's low.
    const maxRetries = isPaid ? Number.MAX_SAFE_INTEGER : 2;

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

            const response = await ai.models.generateContent({
                model: this.modelName,
                contents: chunk,
                config: { 
                    systemInstruction: sysInstruction, 
                    temperature: currentTemp,
                    // Safety Settings: BLOCK_NONE to prevent false positives on literary content
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
            // Fatal errors that should stop everything immediately
            if (errMsg === "API_KEY_INVALID") throw error;
            
            attempt++;
            
            if (isPaid) {
                // PAID MODEL LOGIC: Infinite Retry with Backoff
                console.warn(`Paid Model Error (Attempt ${attempt}): ${errMsg}. Retrying...`);
                // Exponential backoff capped at 10 seconds
                const delay = Math.min(1000 * Math.pow(1.5, attempt), 10000); 
                await new Promise(resolve => setTimeout(resolve, delay));
                continue; // Force retry
            } else {
                // FREE MODEL LOGIC: Limited Retry
                if (errMsg.includes('429')) throw new Error("API_QUOTA_EXCEEDED"); // Let outer loop handle 429 countdown
                
                if (attempt <= maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                } else {
                    break; // Give up
                }
            }
        }
    }
    
    // If we are here, it means we exhausted retries (only possible for Free model)
    return chunk;
  }
}