
import JSZip from 'jszip';
import { GeminiTranslator, getApiKey } from './geminiService';
import { GoogleGenAI } from '@google/genai';
import { UILanguage, TranslationSettings, ResumeInfo, BookStats, LogEntry, UsageStats, BookStrategy } from '../design';
import { STRINGS_LOGS } from '../lang/logs';

export interface TranslationProgress {
  currentFile: number;
  totalFiles: number;
  currentPercent: number;
  status: 'idle' | 'processing' | 'completed' | 'error' | 'analyzing' | 'resuming' | 'waiting';
  logs: LogEntry[];
  etaSeconds?: number;
  strategy?: BookStrategy;
  usage?: UsageStats;
  wordsPerSecond?: number;
  tokensPerSecond?: number;
  totalProcessedWords?: number;
  lastZipPathIndex?: number;
  lastNodeIndex?: number;
  translatedNodes?: Record<string, string[]>;
  totalProcessedSentences?: number;
  waitCountdown?: number; // Kota beklemesi için geri sayım
}

function getLogStr(uiLang: string, key: string): string {
  const bundle = STRINGS_LOGS[uiLang] || STRINGS_LOGS['en'];
  return bundle[key] || STRINGS_LOGS['en'][key];
}

export function countSentences(text: string): number {
    if (!text || !text.trim()) return 0;
    const cleanText = text.replace(/<[^>]*>/g, ' ').trim();
    if (cleanText.length === 0) return 0;
    const matches = cleanText.match(/[.!?]+/g);
    return matches ? matches.length : 1;
}

export interface EpubStructure {
  opfPath: string;
  opfFolder: string;
  processList: string[];
  metadata: {
    title: string;
    creator: string;
    description: string;
  };
  ncxPath?: string;
}

export function resolveRelativePath(basePath: string, relativePath: string): string {
  if (!basePath) return relativePath;
  const stack = basePath.split('/').filter(Boolean);
  const parts = relativePath.split('/');
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join('/');
}

export async function parseEpubStructure(epubZip: JSZip, uiLang: string = 'en'): Promise<EpubStructure> {
  const parser = new DOMParser();
  
  // 1. Rootfile Tespiti
  const containerXml = await epubZip.file("META-INF/container.xml")?.async("string");
  if (!containerXml) {
    throw new Error(getLogStr(uiLang, 'error_container_xml_missing') || "META-INF/container.xml not found. Invalid EPUB.");
  }
  
  const containerDoc = parser.parseFromString(containerXml, "application/xml");
  const parseError = containerDoc.querySelector("parsererror");
  if (parseError) {
    throw new Error(getLogStr(uiLang, 'error_container_xml_parse') || "Failed to parse container.xml.");
  }

  const rootfile = containerDoc.querySelector("rootfile");
  const opfPath = rootfile?.getAttribute("full-path");
  if (!opfPath) {
    throw new Error(getLogStr(uiLang, 'error_opf_path_missing') || "OPF path not found in container.xml.");
  }

  // 2. Harita ve Omurga (Manifest & Spine)
  const opfContent = await epubZip.file(opfPath)?.async("string");
  if (!opfContent) {
    const msg = getLogStr(uiLang, 'error_opf_file_missing') || `OPF file not found: {0}`;
    throw new Error(msg.replace('{0}', opfPath));
  }

  const opfDoc = parser.parseFromString(opfContent, "application/xml");
  const opfParseError = opfDoc.querySelector("parsererror");
  if (opfParseError) {
    throw new Error(getLogStr(uiLang, 'error_opf_parse') || "Failed to parse OPF file.");
  }

  const opfFolder = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/')) : '';

  const metadata = {
    title: opfDoc.querySelector("dc\\:title, title")?.textContent || "Untitled",
    creator: opfDoc.querySelector("dc\\:creator, creator")?.textContent || "Unknown",
    description: opfDoc.querySelector("dc\\:description, description")?.textContent || "",
  };

  const manifestItems = Array.from(opfDoc.querySelectorAll("manifest > item"));
  const idToHref: Record<string, string> = {};
  manifestItems.forEach(item => {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) {
      idToHref[id] = href;
    }
  });

  // 3. Dinamik Okuma Sırası
  const spineItems = Array.from(opfDoc.querySelectorAll("spine > itemref"));
  if (spineItems.length === 0) {
    throw new Error(getLogStr(uiLang, 'error_spine_missing') || "No reading order (spine) found in OPF.");
  }

  const tocId = opfDoc.querySelector("spine")?.getAttribute("toc");
  let ncxPath: string | undefined = undefined;
  if (tocId && idToHref[tocId]) {
      ncxPath = resolveRelativePath(opfFolder, decodeURIComponent(idToHref[tocId]));
  }

  // 4. Göreceli Yol (Relative Path) Çözümlemesi
  const processList = spineItems.map(item => {
    const idref = item.getAttribute("idref");
    if (!idref) return null;
    
    const href = idToHref[idref];
    if (!href) return null;

    const decodedHref = decodeURIComponent(href);
    const resolvedPath = resolveRelativePath(opfFolder, decodedHref);
    return resolvedPath;
  }).filter((p): p is string => p !== null && epubZip.file(p) !== null);

  if (processList.length === 0) {
    throw new Error(getLogStr(uiLang, 'error_no_html_files') || "No valid HTML/XHTML files found to process.");
  }

  return {
    opfPath,
    opfFolder,
    processList,
    metadata,
    ncxPath
  };
}

export async function calculateEpubStats(file: File, targetTags: string[], hasUserKey: boolean, modelId: string = 'gemini-2.5-flash'): Promise<BookStats> {
  const epubBuffer = await file.arrayBuffer();
  const epubZip = await new JSZip().loadAsync(epubBuffer);

  const { processList } = await parseEpubStructure(epubZip, 'en');

  let totalChars = 0;
  let totalWords = 0;
  let totalSentences = 0;
  let totalNodes = 0;
  const fileSentenceCounts: number[] = [];
  let fullTextForTokens = "";

  for (let i = 0; i < processList.length; i++) {
    const path = processList[i];
    const content = await epubZip.file(path)?.async("string");
    if (!content) {
        fileSentenceCounts.push(0);
        continue;
    }
    
    const contentWithoutScripts = content.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
    
    // Count nodes based on targetTags
    let nodeCount = 0;
    targetTags.forEach(tag => {
        const regex = new RegExp(`<${tag}[\\s>]`, 'gi');
        const matches = contentWithoutScripts.match(regex);
        if (matches) nodeCount += matches.length;
    });
    totalNodes += nodeCount;

    const cleanText = contentWithoutScripts.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    if (cleanText.length > 0) {
        totalChars += cleanText.length;
        fullTextForTokens += cleanText + "\n";
        
        let wordCount = 0;
        let inWord = false;
        for (let j = 0; j < cleanText.length; j++) {
            if (cleanText.charCodeAt(j) > 32) {
                if (!inWord) { wordCount++; inWord = true; }
            } else {
                inWord = false;
            }
        }
        totalWords += wordCount;
        
        const matches = cleanText.match(/[.!?]+/g);
        const fileSentences = matches ? matches.length : 1;
        totalSentences += fileSentences;
        fileSentenceCounts.push(fileSentences);
    } else {
        fileSentenceCounts.push(0);
    }

    if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  let estimatedTokens = Math.ceil(totalChars / 3.5);
  try {
      const ai = new GoogleGenAI({ apiKey: getApiKey() });
      const countTokensResponse = await ai.models.countTokens({
          model: "gemini-2.5-flash",
          contents: fullTextForTokens,
      });
      if (countTokensResponse.totalTokens) {
          estimatedTokens = countTokensResponse.totalTokens;
      }
  } catch (e) {
      console.warn("Failed to count tokens via API, using fallback estimation.", e);
  }

  const estimatedChunks = totalNodes > 0 ? totalNodes : Math.ceil(totalChars / 500); 
  
  // Free tier is strictly limited to 15 RPM
  const durationFree = Math.ceil(estimatedChunks / 15); 
  // Max duration if every request hits a timeout (e.g. 10s extra per request)
  // Base delay is ~4.5s. If it hits 429 once per request, it adds 10s.
  // 14.5s per request = ~4 requests per minute.
  // Let's use 24s per request (4.5s + 10s + 10s) as a worst-case scenario = 2.5 RPM
  const durationFreeMax = Math.ceil(estimatedChunks * 24 / 60);

  // Paid tier depends on the model's speed
  let rpmPaid = 360; // default fast (gemini-2.5-flash)
  if (modelId === 'gemini-3.1-pro-preview') {
      rpmPaid = 60; // slower expert models
  } else if (modelId === 'gemini-3-flash-preview' || modelId === 'gemini-3.1-flash-lite-preview') {
      rpmPaid = 120; // balanced models
  } else {
      rpmPaid = 360; // fast models
  }
  
  const durationPro = Math.ceil(estimatedChunks / rpmPaid); 

  // Calculate estimated cost based on the selected model
  // Input tokens are the original text, output tokens are roughly the same size
  const inputTokensM = estimatedTokens / 1_000_000;
  const outputTokensM = estimatedTokens / 1_000_000;
  
  let inputPricePerM = 0;
  let outputPricePerM = 0;
  
  switch (modelId) {
      case 'gemini-2.5-flash-lite':
      case 'gemini-2.5-flash':
      case 'gemini-3.1-flash-lite-preview':
      case 'gemini-3-flash-preview':
          inputPricePerM = 0.075;
          outputPricePerM = 0.30;
          break;
      case 'gemini-3.1-pro-preview':
          inputPricePerM = 1.25;
          outputPricePerM = 5.00;
          break;
      default:
          inputPricePerM = 0.075;
          outputPricePerM = 0.30;
  }
  
  const estimatedCost = (inputTokensM * inputPricePerM) + (outputTokensM * outputPricePerM);

  return {
    totalChars,
    totalWords,
    totalSentences,
    estimatedTokens,
    estimatedChunks,
    estimatedDurationFree: Math.max(1, durationFree), 
    estimatedDurationFreeMax: Math.max(1, durationFreeMax),
    estimatedDurationPro: Math.max(1, durationPro),
    fileSentenceCounts,
    estimatedCost
  };
}

export async function analyzeEpubOnly(
  file: File,
  settings: TranslationSettings,
  feedback?: string,
  onLog?: (msg: string, type: 'info' | 'warning' | 'error' | 'success') => void
): Promise<BookStrategy> {
  const translator = new GeminiTranslator(settings.temperature, settings.sourceLanguage, settings.targetLanguage, settings.modelId, settings.isPaidTier);
  const epubBuffer = await file.arrayBuffer();
  const epubZip = await new JSZip().loadAsync(epubBuffer);
  
  const { metadata } = await parseEpubStructure(epubZip, settings.uiLang);

  return await translator.analyzeBook(metadata, undefined, settings.uiLang, feedback, onLog);
}

export async function processEpub(
  file: File, 
  settings: TranslationSettings,
  onProgress: (progress: TranslationProgress) => void,
  signal: AbortSignal,
  resumeFrom?: ResumeInfo,
  precomputedStrategy?: BookStrategy,
  precomputedStats?: BookStats 
): Promise<{ epubBlob: Blob }> {
  const ui = settings.uiLang;
  const translator = new GeminiTranslator(settings.temperature, settings.sourceLanguage, settings.targetLanguage, settings.modelId, settings.isPaidTier);
  const epubBuffer = await file.arrayBuffer();
  const epubZip = await new JSZip().loadAsync(epubBuffer);

  let totalWords = 0;
  let processedFilesCount = resumeFrom ? resumeFrom.zipPathIndex : 0;
  let accumulatedSentences = resumeFrom && resumeFrom.totalProcessedSentences ? resumeFrom.totalProcessedSentences : 0;
  
  let processList: string[] = [];
  // Use a fresh copy of translated nodes if resuming, so we have the full history
  const translatedNodes: Record<string, string[]> = resumeFrom ? { ...resumeFrom.translatedNodes } : {};
  let strategy: BookStrategy | undefined = precomputedStrategy;

  const cumulativeLogs: LogEntry[] = [
    { timestamp: new Date().toLocaleTimeString(), text: getLogStr(ui, 'analyzing'), type: 'info' }
  ];

  const totalBookSentences = precomputedStats?.totalSentences || 0;
  let totalWaitTimeMs = 0; // Toplam bekleme süresi (Hız hesaplamasından düşmek için)
  const startTime = Date.now();
  let consecutiveQuotaErrors = 0;

  const triggerProgress = (updates: Partial<TranslationProgress>) => {
    let percent = 0;
    if (totalBookSentences > 0) {
        percent = Math.min(99, Math.round((accumulatedSentences / totalBookSentences) * 100));
    } else {
        percent = processList.length > 0 ? Math.round((processedFilesCount / processList.length) * 100) : 0;
    }

    onProgress({
      currentFile: processedFilesCount,
      totalFiles: processList.length || 0,
      currentPercent: percent,
      status: updates.status || 'processing',
      logs: [...cumulativeLogs],
      strategy,
      usage: translator.getUsage(),
      totalProcessedWords: totalWords,
      translatedNodes,
      totalProcessedSentences: accumulatedSentences,
      ...updates
    });
  };

  const addLog = (text: string, type: LogEntry['type'] = 'info') => {
    cumulativeLogs.push({ timestamp: new Date().toLocaleTimeString(), text, type });
    if (cumulativeLogs.length > 50) cumulativeLogs.shift();
    triggerProgress({});
  };

  const isFreeTier = !settings.isPaidTier;
  let minInterval = isFreeTier ? 4500 : 0; 
  let currentConcurrency = isFreeTier ? 1 : 5;
  
  if (isFreeTier) {
      addLog(getLogStr(ui, 'freeTierActive') || "Free Tier Pacing Active (15 RPM)...", 'warning');
  }

  const epubStructure: EpubStructure = await parseEpubStructure(epubZip, ui);
  
  processList = epubStructure.processList;
  const parser = new DOMParser();

  // STRATEGY
  if (!strategy) {
    triggerProgress({ status: 'analyzing' });
    try {
      strategy = await translator.analyzeBook(epubStructure.metadata, undefined, ui);
    } catch (err: any) {
        console.warn("Analysis error caught in processEpub:", err);
        strategy = { 
            genre_en: "Literature", tone_en: "Narrative", author_style_en: "Fluid", strategy_en: "Fidelity",
            genre_translated: "Edebiyat", tone_translated: "Anlatı", author_style_translated: "Akıcı", strategy_translated: "Sadakat",
            literary_fidelity_note: "Emergency Fallback", detected_creativity_level: 0.3, isFallback: true 
        };
    }
  } else {
    addLog(getLogStr(ui, 'preComputed'), 'success');
  }
  
  translator.setStrategy(strategy);

  // --- METADATA TRANSLATION ---
  if (!resumeFrom) {
      addLog(getLogStr(ui, 'translatingMetadata') || "Translating book metadata...", 'info');
      try {
          const translatedMeta = await translator.translateMetadata(epubStructure.metadata);
          
          // Update OPF file
          const opfContent = await epubZip.file(epubStructure.opfPath)?.async("string");
          if (opfContent) {
              const opfDoc = parser.parseFromString(opfContent, "application/xml");
              
              const titleNode = opfDoc.querySelector("dc\\:title, title");
              if (titleNode && translatedMeta.title) {
                  titleNode.textContent = translatedMeta.title;
              }
              
              const descNode = opfDoc.querySelector("dc\\:description, description");
              if (descNode && translatedMeta.description) {
                  descNode.textContent = translatedMeta.description;
              }
              
              const serializer = new XMLSerializer();
              epubZip.file(epubStructure.opfPath, serializer.serializeToString(opfDoc));
          }
          
          // Translate NCX file if it exists
          if (epubStructure.ncxPath) {
              const ncxContent = await epubZip.file(epubStructure.ncxPath)?.async("string");
              if (ncxContent) {
                  const ncxDoc = parser.parseFromString(ncxContent, "application/xml");
                  const textNodes = Array.from(ncxDoc.querySelectorAll("navLabel > text"));
                  for (const node of textNodes) {
                      if (node.textContent && node.textContent.trim() !== "") {
                          node.textContent = await translator.translateSingle(node.textContent);
                      }
                  }
                  const serializer = new XMLSerializer();
                  epubZip.file(epubStructure.ncxPath, serializer.serializeToString(ncxDoc));
              }
          }
      } catch (err) {
          console.warn("Failed to update OPF metadata", err);
      }
  }
  // --- END METADATA TRANSLATION ---

  // --- CRITICAL RESTORATION PHASE ---
  // If resuming, we have loaded a fresh 'epubZip' from the source file. 
  // We MUST apply the previously translated segments to it BEFORE starting the main loop.
  if (resumeFrom && Object.keys(translatedNodes).length > 0) {
     addLog(getLogStr(ui, 'restoringContent') || "Restoring previous translations...", 'info');
     
     for (const path of Object.keys(translatedNodes)) {
        const content = await epubZip.file(path)?.async("string");
        if (!content) continue;

        const doc = parser.parseFromString(content, "text/html");
        const nodes = Array.from(doc.querySelectorAll(settings.targetTags.join(',')));
        const fileTranslations = translatedNodes[path];
        
        let modified = false;
        fileTranslations.forEach((trans, idx) => {
             // Only restore if translation exists and matches structure
             if (trans && nodes[idx]) {
                 nodes[idx].innerHTML = trans;
                 modified = true;
             }
        });

        if (modified) {
            const serializer = new XMLSerializer();
            epubZip.file(path, serializer.serializeToString(doc));
        }
     }
  }
  // --- END RESTORATION ---

  addLog(getLogStr(ui, 'found').replace('{0}', processList.length.toString()), 'success');
  
  // Hareketli ortalama (Moving Average) için son X işlemin sürelerini ve cümle sayılarını tutalım
  const recentSpeeds: { sentences: number, timeMs: number }[] = [];
  const MAX_RECENT_SPEEDS = 20; // Son 20 batch'i hatırla

  for (let zipIdx = processedFilesCount; zipIdx < processList.length; zipIdx++) {
    const path = processList[zipIdx];
    if (signal.aborted) throw new Error("Stopped.");

    const content = await epubZip.file(path)?.async("string");
    if (!content) continue;

    const doc = parser.parseFromString(content, "text/html");
    const nodes = Array.from(doc.querySelectorAll(settings.targetTags.join(',')));

    if (nodes.length > 0) {
      addLog(getLogStr(ui, 'processingFile').replace('{0}', path.split('/').pop() || ""), 'info');
      if (!translatedNodes[path]) translatedNodes[path] = [];
      const startNodeIdx = (resumeFrom && zipIdx === resumeFrom.zipPathIndex) ? resumeFrom.nodeIndex : 0;

      for (let batchStart = startNodeIdx; batchStart < nodes.length; batchStart += currentConcurrency) {
        if (signal.aborted) throw new Error("Stopped.");
        
        const stepStart = Date.now(); 
        const batchEnd = Math.min(batchStart + currentConcurrency, nodes.length);
        const batchIndices = Array.from({ length: batchEnd - batchStart }, (_, i) => batchStart + i);
        
        let batchSentences = 0;
        let hasQuotaError = false;

        const tasks = batchIndices.map(async (nodeIdx) => {
            const node = nodes[nodeIdx];
            const original = node.innerHTML.trim();
            if (!original) return { nodeIdx, original, trans: original, sentences: 0, success: false };

            const nodeSentences = countSentences(original);

            if (translatedNodes[path][nodeIdx]) {
                return { nodeIdx, original, trans: translatedNodes[path][nodeIdx], sentences: nodeSentences, success: false, cached: true };
            }

            try {
                const trans = await translator.translateSingle(original);
                return { nodeIdx, original, trans, sentences: nodeSentences, success: true };
            } catch (err: any) {
                return { nodeIdx, original, trans: original, sentences: nodeSentences, success: false, error: err };
            }
        });

        const results = await Promise.all(tasks);

        for (const res of results) {
            const node = nodes[res.nodeIdx];
            if (res.error) {
                if (res.error.message && res.error.message.includes("VALIDATION_FAILED")) {
                     addLog(getLogStr(ui, 'repairing'), 'warning');
                } else if (res.error.message === "API_QUOTA_EXCEEDED" || res.error.message?.includes('429')) {
                    hasQuotaError = true;
                } else if (res.error.message === "API_KEY_INVALID") {
                    console.warn("Translation failed due to invalid/missing key.");
                } else {
                    console.error("Critical node translation error:", res.error);
                    addLog(getLogStr(ui, 'error').replace('{0}', res.error.message || "Unknown error"), 'error');
                }
                node.innerHTML = res.original;
            } else {
                node.innerHTML = res.trans;
                if (res.success) {
                    translatedNodes[path][res.nodeIdx] = res.trans;
                    totalWords += (node.textContent || "").split(/\s+/).length;
                }
            }
            batchSentences += res.sentences;
        }

        if (hasQuotaError) {
            consecutiveQuotaErrors++;
            
            if (consecutiveQuotaErrors >= (isFreeTier ? 3 : 10)) {
                const stopMsg = getLogStr(ui, 'quotaExhaustedStop') || "Quota exhausted. Stopping translation.";
                throw new Error(`QUOTA_EXHAUSTED_STOP|${stopMsg}`);
            }

            const waitSeconds = 65;
            addLog(getLogStr(ui, 'quotaExceeded'), 'warning');
            
            if (!isFreeTier) {
                // Paid tier hit a limit. Just wait and maybe slightly reduce concurrency, but don't drop to free tier.
                if (currentConcurrency > 2) {
                    currentConcurrency -= 1;
                    addLog(getLogStr(ui, 'rateLimitReducingConcurrency').replace('{0}', currentConcurrency.toString()), 'warning');
                } else {
                    addLog(getLogStr(ui, 'rateLimitWaiting'), 'warning');
                }
            } else {
                // Eğer Paid Tier olarak işaretlenmediyse (Free Key kullanıyor),
                // hızı otomatik olarak Free Tier seviyesine düşür.
                if (currentConcurrency > 1 || minInterval < 4500) {
                    addLog(getLogStr(ui, 'autoDowngradingFreeTier'), 'warning');
                    currentConcurrency = 1;
                    minInterval = 4500;
                }
            }
            
            for (let i = waitSeconds; i > 0; i--) {
                if (signal.aborted) break;
                
                const currentActiveTimeMs = (Date.now() - startTime) - totalWaitTimeMs;
                const activeSeconds = Math.max(1, currentActiveTimeMs / 1000);
                const wps = totalWords / activeSeconds;
                const currentUsage = translator.getUsage();
                const tps = currentUsage.totalTokens / activeSeconds;
                
                let tempEta = 0;
                if (totalBookSentences > 0) {
                    const remainingSentences = totalBookSentences - accumulatedSentences;
                    if (recentSpeeds.length > 5) {
                        const totalRecentSentences = recentSpeeds.reduce((sum, item) => sum + item.sentences, 0);
                        const totalRecentTimeMs = recentSpeeds.reduce((sum, item) => sum + item.timeMs, 0);
                        const avgTimePerSentenceMs = totalRecentTimeMs / Math.max(1, totalRecentSentences);
                        tempEta = Math.max(0, Math.round((remainingSentences * avgTimePerSentenceMs) / 1000));
                    } else {
                        const avgTimePerSentence = activeSeconds / (Math.max(1, accumulatedSentences - (resumeFrom?.totalProcessedSentences || 0)));
                        tempEta = Math.round(remainingSentences * avgTimePerSentence);
                    }
                }
                
                triggerProgress({
                    status: 'waiting',
                    waitCountdown: i,
                    etaSeconds: tempEta + i,
                    wordsPerSecond: wps,
                    tokensPerSecond: tps
                });
                
                await new Promise(r => setTimeout(r, 1000));
                totalWaitTimeMs += 1000;
            }
            
            if (signal.aborted) throw new Error("Stopped.");
            
            batchStart -= currentConcurrency; 
            continue; 
        } else {
            consecutiveQuotaErrors = 0;
        }

        accumulatedSentences += batchSentences;

        const stepEnd = Date.now();
        const elapsed = stepEnd - stepStart;

        if (minInterval > 0) {
            const delay = Math.max(0, minInterval - elapsed);
            if (delay > 0) {
                 await new Promise(r => setTimeout(r, delay));
            }
        }
        
        const currentActiveTimeMs = (Date.now() - startTime) - totalWaitTimeMs;
        const activeSeconds = Math.max(0.1, currentActiveTimeMs / 1000);
        const wps = totalWords / activeSeconds;
        const currentUsage = translator.getUsage();
        const tps = currentUsage.totalTokens / activeSeconds;
        
        // Hareketli ortalamayı güncelle
        if (batchSentences > 0) {
            recentSpeeds.push({ sentences: batchSentences, timeMs: Date.now() - stepStart });
            if (recentSpeeds.length > MAX_RECENT_SPEEDS) {
                recentSpeeds.shift();
            }
        }

        let eta = 0;
        if (totalBookSentences > 0) {
            const remainingSentences = totalBookSentences - accumulatedSentences;
            
            if (recentSpeeds.length > 5) {
                // Yeterli veri varsa hareketli ortalama kullan
                const totalRecentSentences = recentSpeeds.reduce((sum, item) => sum + item.sentences, 0);
                const totalRecentTimeMs = recentSpeeds.reduce((sum, item) => sum + item.timeMs, 0);
                const avgTimePerSentenceMs = totalRecentTimeMs / Math.max(1, totalRecentSentences);
                eta = Math.max(0, Math.round((remainingSentences * avgTimePerSentenceMs) / 1000));
            } else if (accumulatedSentences > 10) {
                // Genel ortalama (fallback)
                const avgTimePerSentence = activeSeconds / (accumulatedSentences - (resumeFrom?.totalProcessedSentences || 0));
                eta = Math.max(0, Math.round(remainingSentences * avgTimePerSentence));
            } else {
                // Başlangıç tahmini (Tier bazlı)
                const baselineSecondsPerSentence = (minInterval > 0 ? minInterval / 1000 : 0.5) / currentConcurrency;
                eta = Math.max(0, Math.round(remainingSentences * baselineSecondsPerSentence));
            }
        } else {
             const currentProgressFrac = (zipIdx + (batchEnd / nodes.length)) / processList.length;
             if(currentProgressFrac > 0.01) {
                const totalEstimatedTime = activeSeconds / currentProgressFrac;
                eta = Math.max(0, Math.round(totalEstimatedTime - activeSeconds));
             }
        }

        triggerProgress({
            wordsPerSecond: wps,
            tokensPerSecond: tps,
            etaSeconds: eta,
            lastZipPathIndex: zipIdx,
            lastNodeIndex: batchEnd - 1,
            status: 'processing',
            waitCountdown: undefined
        });
      }
      
      const serializer = new XMLSerializer();
      epubZip.file(path, serializer.serializeToString(doc));
    }
    processedFilesCount++;
  }

  addLog(getLogStr(ui, 'saving'), 'info');
  
  // Yield to the browser so it can render the "Saving EPUB..." log before the CPU-intensive zip generation
  await new Promise(resolve => setTimeout(resolve, 100));

  const epubBlob = await epubZip.generateAsync({ type: "blob", mimeType: "application/epub+zip", compression: "DEFLATE" });
  
  addLog(getLogStr(ui, 'finished'), 'success');
  onProgress({ currentFile: processList.length, totalFiles: processList.length, currentPercent: 100, status: 'completed', logs: [...cumulativeLogs], strategy, usage: translator.getUsage() });
  
  return { epubBlob };
}
