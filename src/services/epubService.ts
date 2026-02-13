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

export async function calculateEpubStats(file: File, targetTags: string[], hasUserKey: boolean): Promise<BookStats> {
  const epubBuffer = await file.arrayBuffer();
  const epubZip = await new JSZip().loadAsync(epubBuffer);
  const parser = new DOMParser();

  const containerXml = await epubZip.file("META-INF/container.xml")?.async("string");
  const containerDoc = parser.parseFromString(containerXml || "", "application/xml");
  const opfPath = containerDoc.querySelector("rootfile")?.getAttribute("full-path") || "";
  const opfContent = await epubZip.file(opfPath)?.async("string");
  const opfDoc = parser.parseFromString(opfContent || "", "application/xml");
  const opfFolder = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/')) : '';

  const manifestItems = Array.from(opfDoc.querySelectorAll("manifest > item"));
  const idToHref: Record<string, string> = {};
  manifestItems.forEach(item => idToHref[item.getAttribute("id") || ""] = item.getAttribute("href") || "");

  const spineItems = Array.from(opfDoc.querySelectorAll("spine > itemref"));
  
  const processList = spineItems.map(item => {
    const href = idToHref[item.getAttribute("idref") || ""];
    const path = opfFolder ? `${opfFolder}/${href}` : href;
    return decodeURIComponent(path);
  }).filter(p => epubZip.file(p));

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
  feedback?: string
): Promise<BookStrategy> {
  const translator = new GeminiTranslator(settings.temperature, settings.sourceLanguage, settings.targetLanguage, settings.modelId);
  const epubBuffer = await file.arrayBuffer();
  const epubZip = await new JSZip().loadAsync(epubBuffer);
  
  const containerXml = await epubZip.file("META-INF/container.xml")?.async("string");
  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml || "", "application/xml");
  const opfPath = containerDoc.querySelector("rootfile")?.getAttribute("full-path") || "";
  const opfContent = await epubZip.file(opfPath)?.async("string");
  const opfDoc = parser.parseFromString(opfContent || "", "application/xml");

  const metadata = {
    title: opfDoc.querySelector("dc\\:title, title")?.textContent || "Untitled",
    creator: opfDoc.querySelector("dc\\:creator, creator")?.textContent || "Unknown",
    description: opfDoc.querySelector("dc\\:description, description")?.textContent || "",
  };

  return await translator.analyzeBook(metadata, undefined, settings.uiLang, feedback);
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
  const translator = new GeminiTranslator(settings.temperature, settings.sourceLanguage, settings.targetLanguage, settings.modelId);
  const epubBuffer = await file.arrayBuffer();
  const epubZip = await new JSZip().loadAsync(epubBuffer);

  let totalWords = 0;
  let processedFilesCount = resumeFrom ? resumeFrom.zipPathIndex : 0;
  let accumulatedSentences = resumeFrom && resumeFrom.totalProcessedSentences ? resumeFrom.totalProcessedSentences : 0;
  
  let processList: string[] = [];
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

  // UPDATED: Check for the new model ID or any generic flash-lite id
  const isFreeTier = !settings.hasPaidKey && (settings.modelId === 'gemini-2.0-flash' || settings.modelId?.includes('flash-lite'));
  const minInterval = isFreeTier ? 4000 : 0; 
  
  if (isFreeTier) {
      addLog(getLogStr(ui, 'freeTierActive') || "Free Tier Pacing Active (15 RPM)...", 'warning');
  }

  const containerXml = await epubZip.file("META-INF/container.xml")?.async("string");
  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml || "", "application/xml");
  const opfPath = containerDoc.querySelector("rootfile")?.getAttribute("full-path") || "";
  const opfContent = await epubZip.file(opfPath)?.async("string");
  const opfDoc = parser.parseFromString(opfContent || "", "application/xml");
  const opfFolder = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/')) : '';

  if (!strategy) {
    triggerProgress({ status: 'analyzing' });
    const metadata = {
      title: opfDoc.querySelector("dc\\:title, title")?.textContent || "Untitled",
      creator: opfDoc.querySelector("dc\\:creator, creator")?.textContent || "Unknown",
      description: opfDoc.querySelector("dc\\:description, description")?.textContent || "",
    };
    try {
      strategy = await translator.analyzeBook(metadata, undefined, ui);
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

  const manifestItems = Array.from(opfDoc.querySelectorAll("manifest > item"));
  const idToHref: Record<string, string> = {};
  manifestItems.forEach(item => idToHref[item.getAttribute("id") || ""] = item.getAttribute("href") || "");

  const spineItems = Array.from(opfDoc.querySelectorAll("spine > itemref"));
  processList = spineItems.map(item => {
    const href = idToHref[item.getAttribute("idref") || ""];
    const path = opfFolder ? `${opfFolder}/${href}` : href;
    return decodeURIComponent(path);
  }).filter(p => epubZip.file(p)) as string[];

  addLog(getLogStr(ui, 'found').replace('{0}', processList.length.toString()), 'success');

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

      for (let nodeIdx = startNodeIdx; nodeIdx < nodes.length; nodeIdx++) {
        if (signal.aborted) throw new Error("Stopped.");
        
        const stepStart = Date.now(); 
        const node = nodes[nodeIdx];
        const original = node.innerHTML.trim();
        if (!original) continue;

        const nodeSentences = countSentences(original);

        if (translatedNodes[path][nodeIdx]) {
          node.innerHTML = translatedNodes[path][nodeIdx];
        } else {
          try {
            const trans = await translator.translateSingle(original);
            node.innerHTML = trans;
            translatedNodes[path][nodeIdx] = trans;
            totalWords += (node.textContent || "").split(/\s+/).length;
          } catch (err: any) {
            if (err.message && err.message.includes("VALIDATION_FAILED")) {
                 addLog(getLogStr(ui, 'repairing'), 'warning');
            }
            else if (err.message === "API_QUOTA_EXCEEDED" || err.message?.includes('429')) {
              // 429 Durumu: Akıllı Geri Sayım
              // Bu blokta 65 saniye boyunca döngü kurup her saniye UI güncelleyeceğiz.
              const waitSeconds = 65;
              addLog(getLogStr(ui, 'quotaExceeded'), 'warning');
              
              for (let i = waitSeconds; i > 0; i--) {
                  if (signal.aborted) break;
                  
                  // Aktif işleme süresi (toplam süre - bekleme süresi)
                  const currentActiveTimeMs = (Date.now() - startTime) - totalWaitTimeMs;
                  const activeSeconds = Math.max(1, currentActiveTimeMs / 1000);
                  const wps = totalWords / activeSeconds;
                  
                  // ETA Hesabı: (Kalan Cümle * Cümle Başına Süre) + (Şu anki Geri Sayım)
                  // Bekleme anında ETA'nın artması normaldir.
                  let tempEta = 0;
                  if (totalBookSentences > 0) {
                      const avgTimePerSentence = activeSeconds / (Math.max(1, accumulatedSentences - (resumeFrom?.totalProcessedSentences || 0)));
                      const remainingSentences = totalBookSentences - accumulatedSentences;
                      tempEta = Math.round(remainingSentences * avgTimePerSentence);
                  }
                  
                  // Kullanıcıya "Bekliyorum... X sn" göster
                  triggerProgress({
                      status: 'waiting',
                      waitCountdown: i,
                      etaSeconds: tempEta + i, // Kalan süreye bekleme süresini ekle
                      wordsPerSecond: wps
                  });
                  
                  await new Promise(r => setTimeout(r, 1000));
                  totalWaitTimeMs += 1000;
              }
              
              if (signal.aborted) throw new Error("Stopped.");
              
              // Geri sayım bitti, aynı node'u tekrar dene
              nodeIdx--; 
              continue; 
              
            } else if (err.message === "API_KEY_INVALID") {
              console.warn("Translation failed due to invalid/missing key.");
              node.innerHTML = original;
            } else {
                console.error("Critical node translation error:", err);
                node.innerHTML = original;
            }
          }
        }
        
        accumulatedSentences += nodeSentences;

        const stepEnd = Date.now();
        const elapsed = stepEnd - stepStart;

        // SMART THROTTLING (Ücretsiz Mod Hız Sınırı)
        if (isFreeTier && minInterval > 0) {
            const delay = Math.max(0, minInterval - elapsed);
            if (delay > 0) {
                 await new Promise(r => setTimeout(r, delay));
                 // Bu "kasıtlı" yavaşlatmayı bekleme süresi olarak saymıyoruz, 
                 // çünkü bu işlem hızının bir parçası.
            }
        }
        
        // Hız ve ETA Hesaplama
        const currentActiveTimeMs = (Date.now() - startTime) - totalWaitTimeMs;
        const activeSeconds = Math.max(0.1, currentActiveTimeMs / 1000);
        const wps = totalWords / activeSeconds;
        
        let eta = 0;
        if (totalBookSentences > 0 && accumulatedSentences > 10) {
            const avgTimePerSentence = activeSeconds / (accumulatedSentences - (resumeFrom?.totalProcessedSentences || 0));
            const remainingSentences = totalBookSentences - accumulatedSentences;
            eta = Math.max(0, Math.round(remainingSentences * avgTimePerSentence));
        } else {
             const currentProgressFrac = (zipIdx + (nodeIdx / nodes.length)) / processList.length;
             if(currentProgressFrac > 0.01) {
                const totalEstimatedTime = activeSeconds / currentProgressFrac;
                eta = Math.max(0, Math.round(totalEstimatedTime - activeSeconds));
             }
        }

        triggerProgress({
            wordsPerSecond: wps,
            etaSeconds: eta,
            lastZipPathIndex: zipIdx,
            lastNodeIndex: nodeIdx,
            status: 'processing',
            waitCountdown: undefined // Geri sayımı temizle
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