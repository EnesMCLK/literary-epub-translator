
import JSZip from 'jszip';
import { GeminiTranslator } from './geminiService';
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
    metadata
  };
}

export async function calculateEpubStats(file: File, targetTags: string[], hasUserKey: boolean): Promise<BookStats> {
  const epubBuffer = await file.arrayBuffer();
  const epubZip = await new JSZip().loadAsync(epubBuffer);
  const parser = new DOMParser();

  const { processList } = await parseEpubStructure(epubZip, 'en');

  let totalChars = 0;
  let totalWords = 0;
  let totalSentences = 0;
  const fileSentenceCounts: number[] = [];

  for (const path of processList) {
    const content = await epubZip.file(path)?.async("string");
    if (!content) {
        fileSentenceCounts.push(0);
        continue;
    }
    
    const doc = parser.parseFromString(content, "text/html");
    const nodes = Array.from(doc.querySelectorAll(targetTags.join(',')));
    
    let fileSentences = 0;
    nodes.forEach(node => {
        const text = node.innerHTML.trim();
        if (text.length > 0) {
            const cleanText = node.textContent || "";
            totalChars += cleanText.length;
            totalWords += cleanText.split(/\s+/).length;
            
            const sCount = countSentences(text);
            fileSentences += sCount;
            totalSentences += sCount;
        }
    });
    fileSentenceCounts.push(fileSentences);
  }

  const estimatedTokens = Math.ceil(totalChars / 3.5); 
  const estimatedChunks = Math.ceil(totalChars / 500); 
  const durationFree = Math.ceil(estimatedChunks / 10); 
  const durationPro = Math.ceil(estimatedChunks / 35); 

  return {
    totalChars,
    totalWords,
    totalSentences,
    estimatedTokens,
    estimatedChunks,
    estimatedDurationFree: Math.max(1, durationFree), 
    estimatedDurationPro: Math.max(1, durationPro),
    fileSentenceCounts 
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

  let cumulativeLogs: LogEntry[] = [
    { timestamp: new Date().toLocaleTimeString(), text: getLogStr(ui, 'analyzing'), type: 'info' }
  ];

  const totalBookSentences = precomputedStats?.totalSentences || 0;
  let totalWaitTimeMs = 0; // Toplam bekleme süresi (Hız hesaplamasından düşmek için)
  const startTime = Date.now();

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

  let epubStructure: EpubStructure;
  try {
    epubStructure = await parseEpubStructure(epubZip, ui);
  } catch (err: any) {
    addLog(err.message, 'error');
    throw err;
  }
  
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
            const waitSeconds = 65;
            addLog(getLogStr(ui, 'quotaExceeded'), 'warning');
            
            // Eğer Paid Tier olarak işaretlendiyse ama kota hatası alıyorsa (muhtemelen Free Key kullanıyor),
            // hızı otomatik olarak Free Tier seviyesine düşür.
            if (!isFreeTier && (currentConcurrency > 1 || minInterval < 4500)) {
                addLog("Auto-downgrading to Free Tier pacing to prevent further quota errors.", 'warning');
                currentConcurrency = 1;
                minInterval = 4500;
            }
            
            for (let i = waitSeconds; i > 0; i--) {
                if (signal.aborted) break;
                
                const currentActiveTimeMs = (Date.now() - startTime) - totalWaitTimeMs;
                const activeSeconds = Math.max(1, currentActiveTimeMs / 1000);
                const wps = totalWords / activeSeconds;
                
                let tempEta = 0;
                if (totalBookSentences > 0) {
                    const avgTimePerSentence = activeSeconds / (Math.max(1, accumulatedSentences - (resumeFrom?.totalProcessedSentences || 0)));
                    const remainingSentences = totalBookSentences - accumulatedSentences;
                    tempEta = Math.round(remainingSentences * avgTimePerSentence);
                }
                
                triggerProgress({
                    status: 'waiting',
                    waitCountdown: i,
                    etaSeconds: tempEta + i,
                    wordsPerSecond: wps
                });
                
                await new Promise(r => setTimeout(r, 1000));
                totalWaitTimeMs += 1000;
            }
            
            if (signal.aborted) throw new Error("Stopped.");
            
            batchStart -= currentConcurrency; 
            continue; 
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
                // Free tier: ~4.5 sn / cümle (minInterval nedeniyle)
                // Paid tier: ~0.5 sn / cümle (Concurrency 5 nedeniyle)
                const baselineSecondsPerSentence = isFreeTier ? 4.5 : 0.5;
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
  const epubBlob = await epubZip.generateAsync({ type: "blob", mimeType: "application/epub+zip", compression: "DEFLATE" });
  
  addLog(getLogStr(ui, 'finished'), 'success');
  onProgress({ currentFile: processList.length, totalFiles: processList.length, currentPercent: 100, status: 'completed', logs: [...cumulativeLogs], strategy, usage: translator.getUsage() });
  
  return { epubBlob };
}
