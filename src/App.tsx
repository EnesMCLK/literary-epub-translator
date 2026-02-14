
import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, Play, AlertCircle, Loader2, Clock, 
  Sparkles, Shield, ChevronDown, RefreshCw, Settings as SettingsIcon,
  BarChart3, Activity, StepForward, BrainCircuit, Check, X, Timer, FileUp, Database
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { processEpub, analyzeEpubOnly, calculateEpubStats, TranslationProgress } from './services/epubService';
import { fileStorage } from './services/storageService';
import { ProgressBar } from './components/ProgressBar';
import { LogViewer } from './components/LogViewer';
import { Navigation } from './components/Navigation';
import { HistoryDrawer } from './components/HistoryDrawer';
import { SettingsDrawer } from './components/SettingsDrawer';
import { DownloadActions } from './components/DownloadActions';
import { StatsModal } from './components/StatsModal';
import { OnboardingTour } from './components/OnboardingTour';
import { 
    UILanguage, TranslationSettings, HistoryItem, 
    LANGUAGES_DATA, DEFAULT_TAGS, LANG_CODE_TO_LABEL, AI_MODELS, BookStats, STORAGE_KEY_API, BookStrategy
} from './design';
import { STRINGS_UI } from './lang/ui';

const STORAGE_KEY_HISTORY = 'lit-trans-history';
const STORAGE_KEY_RESUME = 'lit-trans-resume-v2';
const STORAGE_KEY_TOUR = 'lit-trans-tour-seen';
const STORAGE_KEY_THEME = 'lit-trans-theme';

function formatDuration(seconds?: number): string {
  if (seconds === undefined || seconds < 0) return '--';
  if (seconds === 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Ülke kodu -> Dil kodu eşleştirmesi
const COUNTRY_TO_LANG: Record<string, UILanguage> = {
  'TR': 'tr', 'US': 'en', 'GB': 'en', 'AU': 'en', 'CA': 'en',
  'FR': 'fr', 'DE': 'de', 'AT': 'de', 'CH': 'de',
  'ES': 'es', 'MX': 'es', 'AR': 'es',
  'IT': 'it', 'RU': 'ru', 'CN': 'zh', 'TW': 'zh',
  'JP': 'ja', 'KR': 'ko', 'SA': 'ar', 'AE': 'ar', 'EG': 'ar',
  'PT': 'pt', 'BR': 'pt', 'NL': 'nl', 'PL': 'pl',
  'IN': 'hi', 'VN': 'vi'
};

const DEFAULT_MODEL_ID = 'gemini-2.0-flash';

export default function App() {
  const [uiLang, setUiLang] = useState<UILanguage>('en');
  
  // Tema Başlatma Mantığı
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem(STORAGE_KEY_THEME);
    if (savedTheme) {
        return savedTheme === 'dark';
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return true;
    }
    return false;
  });

  const [isLangModalOpen, setIsLangModalOpen] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [hasPaidKey, setHasPaidKey] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [manualKey, setManualKey] = useState('');
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState(false);
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState(false);
  
  // Resume Data State
  const [resumeData, setResumeData] = useState<any | null>(null);
  
  const [isLegalExpanded, setIsLegalExpanded] = useState(false);
  const [isCreativityOptimized, setIsCreativityOptimized] = useState(false);
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [expectedFilename, setExpectedFilename] = useState<string | null>(null);
  const [isRestoringFile, setIsRestoringFile] = useState(false);
  
  // Analiz ve İstatistik State'leri
  const [analyzedModelId, setAnalyzedModelId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [bookStats, setBookStats] = useState<BookStats | null>(null);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);

  // Load UI strings based on selected language
  const t = STRINGS_UI[uiLang] || STRINGS_UI['en'];

  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  
  const [settings, setSettings] = useState<TranslationSettings>({
    temperature: 0.3,
    targetTags: DEFAULT_TAGS,
    sourceLanguage: 'Automatic',
    targetLanguage: LANG_CODE_TO_LABEL['en'],
    modelId: DEFAULT_MODEL_ID,
    uiLang: 'en'
  });

  const [progress, setProgress] = useState<TranslationProgress>({
    currentFile: 0, totalFiles: 0, currentPercent: 0, status: 'idle',
    logs: [], wordsPerSecond: 0, totalProcessedWords: 0
  });
  
  const progressRef = useRef<TranslationProgress | null>(null);

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<{title: string, message: string} | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const targetLabel = LANG_CODE_TO_LABEL[uiLang] || 'Turkish';
    setSettings(prev => ({ ...prev, uiLang, targetLanguage: targetLabel }));
  }, [uiLang]);

  useEffect(() => {
    if (isDarkMode) {
        document.documentElement.classList.add('dark');
        localStorage.setItem(STORAGE_KEY_THEME, 'dark');
    } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem(STORAGE_KEY_THEME, 'light');
    }
  }, [isDarkMode]);

  const detectLanguageFromIP = async (): Promise<UILanguage | null> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      const response = await fetch('https://ipapi.co/json/', { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await response.json();
      const countryCode = data.country_code;
      if (countryCode && COUNTRY_TO_LANG[countryCode]) {
        return COUNTRY_TO_LANG[countryCode];
      }
    } catch (e) { }
    return null;
  };

  const initializeApp = async () => {
    let langToUse: UILanguage = 'en';

    const storedLang = localStorage.getItem('lit-trans-ui-lang') as UILanguage;
    if (storedLang && STRINGS_UI[storedLang]) {
      langToUse = storedLang;
    } else {
      const ipLang = await detectLanguageFromIP();
      if (ipLang) {
        langToUse = ipLang;
      } else {
         const browserLang = navigator.language.split('-')[0] as UILanguage;
         if (STRINGS_UI[browserLang]) langToUse = browserLang;
      }
    }
    setUiLang(langToUse);

    const savedHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
    if (savedHistory) {
        try {
            setHistory(JSON.parse(savedHistory));
        } catch (e) {
            console.error("Failed to parse history", e);
            localStorage.removeItem(STORAGE_KEY_HISTORY);
        }
    }
    
    // Check local storage for quick resume (legacy or last session)
    const savedResume = localStorage.getItem(STORAGE_KEY_RESUME);
    if (savedResume) {
      try { setResumeData(JSON.parse(savedResume)); } catch {}
    }

    let foundKey = false;
    const localKey = localStorage.getItem(STORAGE_KEY_API);
    if (localKey) {
        setManualKey(localKey);
        setHasPaidKey(true);
        foundKey = true;
    } else {
        try {
            // @ts-ignore
            if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
                setHasPaidKey(true);
                foundKey = true;
            }
        } catch(e) {}
    }

    const tourSeen = localStorage.getItem(STORAGE_KEY_TOUR);
    if (!tourSeen) {
      setTimeout(() => setIsTourOpen(true), 1000);
    }

    setSettings(prev => ({ ...prev, modelId: DEFAULT_MODEL_ID }));
    fileStorage.init().catch(console.error);
    setIsInitializing(false);
  };

  useEffect(() => { initializeApp(); }, []);

  const verifyApiKey = async (explicitKey?: string) => {
    setIsVerifying(true);
    const keyToTest = explicitKey || manualKey;
    
    let envKey = '';
    try {
        // @ts-ignore
        if (typeof process !== 'undefined' && process.env && process.env.API_KEY) envKey = process.env.API_KEY;
    } catch(e) {}
    
    const finalKey = keyToTest || envKey;

    if (!finalKey) { setIsVerifying(false); return; }
    
    (window as any).manualApiKey = finalKey;
    localStorage.setItem(STORAGE_KEY_API, finalKey);

    try {
      const ai = new GoogleGenAI({ apiKey: finalKey });
      const response = await ai.models.generateContent({ model: DEFAULT_MODEL_ID, contents: 'ping' });
      if (response.text) {
        setHasPaidKey(true);
      }
    } catch (e: any) {
      console.warn("API Verification Warning:", e);
      if (e.message?.includes('403') || e.message?.includes('API_KEY_INVALID')) {
           setHasPaidKey(false);
      } else {
           setHasPaidKey(true); 
      }
    } finally { setIsVerifying(false); }
  };

  const handleClearKey = () => {
    localStorage.removeItem(STORAGE_KEY_API);
    (window as any).manualApiKey = null;
    setManualKey('');
    setHasPaidKey(false);
    setSettings(prev => ({ ...prev, modelId: DEFAULT_MODEL_ID }));
  };

  const handleConnectAiStudio = async () => {
    if ((window as any).aistudio) {
      try {
        await (window as any).aistudio.openSelectKey();
        if (await (window as any).aistudio.hasSelectedApiKey()) {
            await verifyApiKey(); 
        }
      } catch (err) { console.error(err); }
    }
  };

  const handleMissingKey = () => {
     setIsRightDrawerOpen(true);
  };

  const handleClearHistory = async () => {
      setHistory([]);
      localStorage.removeItem(STORAGE_KEY_HISTORY);
      await fileStorage.clearAll();
  };

  const handleAnalyzeAndStats = async () => {
    if (!file) return;

    if (!hasPaidKey) {
        handleMissingKey();
        return;
    }

    setIsAnalyzing(true);
    setProgress(prev => ({ ...prev, logs: [], strategy: undefined }));
    setBookStats(null);
    
    try {
      const effectiveSettings = { ...settings, modelId: settings.modelId, uiLang, hasPaidKey };

      const [strategy, stats] = await Promise.all([
          analyzeEpubOnly(file, effectiveSettings),
          calculateEpubStats(file, settings.targetTags, hasPaidKey)
      ]);
      
      setProgress(prev => ({ ...prev, strategy: strategy }));
      setAnalyzedModelId(settings.modelId || 'unknown');
      setBookStats(stats);
      
      if (strategy && strategy.detected_creativity_level) {
        setSettings(s => ({ ...s, temperature: strategy.detected_creativity_level }));
        setIsCreativityOptimized(true);
      }

      setIsStatsModalOpen(true);

    } catch (err: any) {
      console.error("Analysis Error:", err);
      if (err.message === "MISSING_KEY_REDIRECT") {
          handleMissingKey();
      } else {
          setError({ title: t.error, message: err.message || "Analysis failed due to an unknown error." });
      }
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  const handleReAnalyzeWithFeedback = async (feedback: string) => {
    if (!file) return;
    setIsAnalyzing(true);
    try {
      const strategy = await analyzeEpubOnly(file, { ...settings, uiLang, hasPaidKey }, feedback);
      setProgress(prev => ({ ...prev, strategy: strategy }));
      if (strategy && strategy.detected_creativity_level) {
        setSettings(s => ({ ...s, temperature: strategy.detected_creativity_level }));
        setIsCreativityOptimized(true);
      }
    } catch (err: any) {
       if (err.message === "MISSING_KEY_REDIRECT") {
          handleMissingKey();
       } else {
          setError({ title: t.error, message: err.message || "Re-analysis failed" });
       }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const addToHistory = (item: HistoryItem) => {
    try {
      const rawHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
      let currentHistory: HistoryItem[] = [];
      if (rawHistory) {
         currentHistory = JSON.parse(rawHistory);
      }
      // Remove item with same ID if exists (to update it)
      const filtered = currentHistory.filter(h => h.id !== item.id);
      const updatedHistory = [item, ...filtered].slice(0, 20); 
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updatedHistory));
      setHistory(updatedHistory);
    } catch (e) {
      console.error("Failed to save history", e);
    }
  };

  const startTranslation = async (isResuming = false) => {
    if (!file) return;

    if (!hasPaidKey) {
        handleMissingKey();
        return;
    }

    setIsProcessing(true);
    setDownloadUrl(null);
    setIsStatsModalOpen(false);
    setExpectedFilename(null); 
    
    // Reuse session ID if resuming to update the same history item, otherwise generate new
    const sessionId = (isResuming && resumeData && resumeData.sessionId) ? resumeData.sessionId : Date.now().toString();

    // 1. Save SOURCE file to IndexedDB if not already there
    try {
        await fileStorage.saveFile(sessionId, file);
    } catch (e) {
        console.warn("Failed to save file to local memory:", e);
    }
    
    abortControllerRef.current = new AbortController();
    progressRef.current = null; 
    
    const effectiveSettings = isResuming && resumeData 
      ? { ...resumeData.settings, hasPaidKey, modelId: resumeData.settings.modelId } 
      : { ...settings, modelId: settings.modelId, uiLang, hasPaidKey };

    try {
      const { epubBlob } = await processEpub(
        file, 
        effectiveSettings, 
        (p) => {
          progressRef.current = p; 
          setProgress(prev => {
            if (p.strategy && !prev.strategy) {
               const recommendedTemp = p.strategy.detected_creativity_level;
               setSettings(s => ({ ...s, temperature: recommendedTemp }));
               setIsCreativityOptimized(true);
               setAnalyzedModelId(effectiveSettings.modelId || null);
            }
            return { ...p, logs: p.logs.length > 0 ? p.logs : prev.logs };
          });
          
          // Update Resume Data in LocalStorage (Fast access)
          if (p.lastZipPathIndex !== undefined && p.lastNodeIndex !== undefined && p.translatedNodes) {
             const res = { 
                 sessionId, // Important for linking
                 filename: file.name, 
                 zipPathIndex: p.lastZipPathIndex, 
                 nodeIndex: p.lastNodeIndex, 
                 translatedNodes: p.translatedNodes, 
                 settings: effectiveSettings,
                 totalProcessedSentences: p.totalProcessedSentences 
             };
             localStorage.setItem(STORAGE_KEY_RESUME, JSON.stringify(res));
          }
        }, 
        abortControllerRef.current.signal,
        isResuming ? resumeData || undefined : undefined,
        progress.strategy,
        bookStats || undefined 
      );
      
      const resultUrl = URL.createObjectURL(epubBlob);
      setDownloadUrl(resultUrl);

      // Save RESULT file to IndexedDB for instant download later
      try {
        await fileStorage.saveFile(sessionId + '_result', epubBlob);
        // Clean up resume data since we are done
        await fileStorage.deleteFile(sessionId + '_resume');
      } catch (e) {
        console.warn("Failed to save result file to memory:", e);
      }

      // Save success history
      const successItem: HistoryItem = { 
          id: sessionId, 
          filename: file.name, 
          sourceLang: settings.sourceLanguage, 
          targetLang: settings.targetLanguage, 
          modelId: effectiveSettings.modelId || 'gemini', 
          timestamp: new Date().toLocaleString(), 
          status: 'completed', 
          settingsSnapshot: { ...effectiveSettings },
          strategySnapshot: progressRef.current?.strategy,
          statsSnapshot: bookStats || undefined,
          wordCount: progressRef.current?.totalProcessedWords || 0,
          hasSavedFile: true,
          hasResultFile: true 
      };
      addToHistory(successItem);

      localStorage.removeItem(STORAGE_KEY_RESUME);
      setResumeData(null);

    } catch (err: any) {
      const isAborted = err.name === 'AbortError' || err.message === 'Stopped.';
      const status = isAborted ? 'partial' : 'failed';
      const errorMsg = isAborted ? 'Stopped by user' : (err.message || "Unknown error");
      
      // CRITICAL: Save Resume Data to IndexedDB for long-term storage
      if (progressRef.current && progressRef.current.translatedNodes) {
         const fullResumeState = {
             sessionId,
             filename: file.name,
             zipPathIndex: progressRef.current.lastZipPathIndex,
             nodeIndex: progressRef.current.lastNodeIndex,
             translatedNodes: progressRef.current.translatedNodes,
             settings: effectiveSettings,
             totalProcessedSentences: progressRef.current.totalProcessedSentences
         };
         try {
             // Save JSON as a Blob to reuse the file storage service
             const resumeBlob = new Blob([JSON.stringify(fullResumeState)], { type: 'application/json' });
             await fileStorage.saveFile(sessionId + '_resume', resumeBlob);
         } catch(e) { console.error("Failed to save resume data", e); }
      }

      const historyItem: HistoryItem = { 
          id: sessionId, 
          filename: file.name, 
          sourceLang: settings.sourceLanguage, 
          targetLang: settings.targetLanguage, 
          modelId: effectiveSettings.modelId || 'gemini', 
          timestamp: new Date().toLocaleString(), 
          status: status, 
          settingsSnapshot: { ...effectiveSettings },
          strategySnapshot: progressRef.current?.strategy, 
          statsSnapshot: bookStats || undefined,
          errorMessage: errorMsg,
          wordCount: progressRef.current?.totalProcessedWords || 0,
          hasSavedFile: true
      };
      addToHistory(historyItem);

      if (!isAborted) {
        if (err.message === "MISSING_KEY_REDIRECT") {
            handleMissingKey();
        } else if (err.message?.includes('429') || err.message?.includes('quota')) {
          setError({ title: t.error, message: t.quotaError });
        } else {
          setError({ title: t.error, message: err.message });
        }
      }
    } finally { setIsProcessing(false); }
  };

  const handleMainAction = () => {
    if (!progress.strategy) {
      handleAnalyzeAndStats();
    } else {
      setIsStatsModalOpen(true);
    }
  };

  const onRestoreHistoryItem = async (item: HistoryItem) => {
    // 1. Restore UI State
    setSettings(item.settingsSnapshot);
    setIsLeftDrawerOpen(false);

    if (item.strategySnapshot) {
        setProgress(prev => ({ ...prev, strategy: item.strategySnapshot }));
        setAnalyzedModelId(item.modelId);
    }
    if (item.statsSnapshot) {
        setBookStats(item.statsSnapshot);
    }

    // 2. Try to load file from Storage
    setIsRestoringFile(true);
    setDownloadUrl(null);
    setFile(null);
    setResumeData(null); // Reset resume data initially

    try {
        const blob = await fileStorage.getFile(item.id);
        if (blob) {
            // Restore Source File
            const fileObj = new File([blob], item.filename, { type: blob.type });
            setFile(fileObj);
            setExpectedFilename(null);
            
            // 3. CHECK FOR SAVED RESUME DATA IN INDEXEDDB
            if (item.status === 'partial' || item.status === 'failed') {
               try {
                   const resumeBlob = await fileStorage.getFile(item.id + '_resume');
                   if (resumeBlob) {
                       const text = await resumeBlob.text();
                       const parsedResume = JSON.parse(text);
                       setResumeData(parsedResume);
                       
                       // Calculate percentage for UI
                       if (item.statsSnapshot && parsedResume.totalProcessedSentences) {
                           const percent = Math.min(99, Math.round((parsedResume.totalProcessedSentences / item.statsSnapshot.totalSentences) * 100));
                           setProgress(prev => ({
                               ...prev,
                               currentPercent: percent,
                               status: 'resuming', // Visual state
                               logs: [{ timestamp: new Date().toLocaleTimeString(), text: `Progress restored at ${percent}%. Ready to resume.`, type: 'info' }]
                           }));
                       }
                   }
               } catch(e) { console.warn("Could not load resume data", e); }
            }
            
            // If completed and result file exists
            if (item.status === 'completed' && item.hasResultFile) {
                try {
                    const resultBlob = await fileStorage.getFile(item.id + '_result');
                    if (resultBlob) {
                        const resultUrl = URL.createObjectURL(resultBlob);
                        setDownloadUrl(resultUrl);
                        setProgress(prev => ({ 
                           ...prev, 
                           status: 'completed', 
                           currentPercent: 100,
                           logs: [{ timestamp: new Date().toLocaleTimeString(), text: 'Translation restored from memory.', type: 'success' }] 
                        }));
                    }
                } catch (resErr) { console.warn("Could not restore result file:", resErr); }
            }
            
        } else {
            setExpectedFilename(item.filename);
            setDownloadUrl(null);
        }
    } catch (e) {
        console.error("Storage restore error", e);
        setExpectedFilename(item.filename);
    } finally {
        setIsRestoringFile(false);
    }
  };

  const handleFileSelect = (f: File) => {
    setFile(f);
    setDownloadUrl(null);
    
    if (expectedFilename && f.name === expectedFilename) {
        // Matched!
    } else {
        setIsCreativityOptimized(false); 
        setAnalyzedModelId(null); 
        setProgress(p => ({...p, strategy: undefined})); 
        setBookStats(null);
        setExpectedFilename(null);
        setResumeData(null);
    }
  };

  // Check if we should show Resume Button
  const canResume = resumeData && file && resumeData.filename === file.name && !isProcessing && !downloadUrl;

  const isWaiting = progress.status === 'waiting';

  if (isInitializing) return <div className="h-screen flex items-center justify-center dark:bg-slate-950"><Loader2 className="animate-spin text-indigo-500" size={40} /></div>;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-all duration-300 flex flex-col relative overflow-hidden">
      {(isLeftDrawerOpen || isRightDrawerOpen) && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[70] transition-opacity" onClick={() => { setIsLeftDrawerOpen(false); setIsRightDrawerOpen(false); }} />
      )}

      {/* Onboarding Tour */}
      <OnboardingTour 
        isOpen={isTourOpen} 
        onClose={() => { setIsTourOpen(false); localStorage.setItem(STORAGE_KEY_TOUR, 'seen'); }}
        t={t}
      />

      {/* Stats Modal */}
      <StatsModal 
        isOpen={isStatsModalOpen}
        onClose={() => setIsStatsModalOpen(false)}
        onConfirm={() => startTranslation(canResume ? true : false)}
        stats={bookStats}
        strategy={progress.strategy}
        uiLang={uiLang}
        hasPaidKey={hasPaidKey}
        onRegenerateAnalysis={handleReAnalyzeWithFeedback}
        isAnalyzing={isAnalyzing}
      />

      <HistoryDrawer 
        isOpen={isLeftDrawerOpen}
        onClose={() => setIsLeftDrawerOpen(false)}
        history={history}
        onClearHistory={handleClearHistory}
        onRestoreSettings={onRestoreHistoryItem}
        t={t}
      />

      <SettingsDrawer 
        isOpen={isRightDrawerOpen}
        onClose={() => setIsRightDrawerOpen(false)}
        t={t}
        settings={settings}
        onUpdateSettings={setSettings}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode(!isDarkMode)}
        uiLang={uiLang}
        onOpenLangModal={() => setIsLangModalOpen(true)}
        hasPaidKey={hasPaidKey}
        manualKey={manualKey}
        setManualKey={(k) => { setManualKey(k); localStorage.setItem(STORAGE_KEY_API, k); }}
        isVerifying={isVerifying}
        onVerifyKey={() => verifyApiKey()}
        onConnectAiStudio={handleConnectAiStudio}
        onClearKey={handleClearKey}
      />

      <Navigation 
        onOpenLeftDrawer={() => setIsLeftDrawerOpen(true)}
        onOpenRightDrawer={() => setIsRightDrawerOpen(true)}
        onOpenTour={() => setIsTourOpen(true)}
        title={t.title}
        description={t.description}
      />

      {/* Main Content Info Bar */}
      <div className="w-full fixed top-16 md:top-20 left-0 right-0 z-40 bg-white/60 dark:bg-slate-950/60 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 md:px-8 py-2 md:py-3.5 flex items-center justify-center">
          <div className="w-full max-w-6xl flex items-center justify-between gap-2 md:gap-6 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-3 md:gap-4 shrink-0">
                  <div className="flex items-center gap-1.5 md:gap-2.5">
                    <div className={`w-2 md:w-2.5 h-2 md:h-2.5 rounded-full ${hasPaidKey ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]'}`}></div>
                    <span className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">{hasPaidKey ? t.paidMode : t.freeMode}</span>
                  </div>
                  <div className="h-3 md:h-4 w-px bg-slate-200 dark:bg-slate-800"></div>
                  <div className="flex items-center gap-1.5 md:gap-2"><BarChart3 size={12} className="text-indigo-500 md:w-3.5 md:h-3.5" /><span className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase">{t.tokens}:</span><span className="text-[10px] md:text-xs font-black italic whitespace-nowrap">{progress.usage?.totalTokens.toLocaleString() || 0}</span></div>
              </div>
              <div className="flex items-center gap-3 md:gap-6 shrink-0">
                  <div className="flex items-center gap-1.5 md:gap-2">
                     {isWaiting ? <Timer size={12} className="text-amber-500 animate-pulse md:w-3.5 md:h-3.5"/> : <Activity size={12} className="text-blue-500 md:w-3.5 md:h-3.5" />}
                     <span className={`text-[8px] md:text-[9px] font-black uppercase ${isWaiting ? 'text-amber-500' : 'text-slate-400'}`}>{t.speed}:</span>
                     <span className={`text-[10px] md:text-xs font-black italic whitespace-nowrap ${isWaiting ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                        {isProcessing || isWaiting ? `${progress.wordsPerSecond?.toFixed(1)} ${t.wordsPerSec || 'w/s'}` : '--'}
                     </span>
                  </div>
                  <div className="flex items-center gap-1.5 md:gap-2">
                     <Clock size={12} className={`${isWaiting ? 'text-amber-500' : 'text-amber-500'} md:w-3.5 md:h-3.5`} />
                     <span className={`text-[8px] md:text-[9px] font-black uppercase ${isWaiting ? 'text-amber-500' : 'text-slate-400'}`}>
                        {isWaiting ? `${t.waiting || 'WAITING'} (${progress.waitCountdown}s)` : t.eta}:
                     </span>
                     <span className={`text-[10px] md:text-xs font-black italic whitespace-nowrap ${isWaiting ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                        {isProcessing || isWaiting ? formatDuration(progress.etaSeconds) : '--'}
                     </span>
                  </div>
              </div>
          </div>
      </div>

      <main className="flex-1 pt-32 md:pt-36 flex flex-col items-center">
        <div className="w-full max-w-5xl px-6 py-6 md:py-12 space-y-8 md:space-y-12 flex flex-col items-center">
            <section className="w-full bg-white dark:bg-slate-900 rounded-[2rem] md:rounded-[3rem] border border-slate-200 dark:border-slate-800 p-6 md:p-12 space-y-8 md:space-y-10 shadow-xl">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] pl-2">{t.uploadLabel}</label>
                  <div className="relative group cursor-pointer">
                    <input type="file" accept=".epub" onChange={(e) => { const f = e.target.files?.[0]; if(f) handleFileSelect(f); }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                    <div className={`py-12 md:py-16 border-3 border-dashed rounded-[2rem] md:rounded-[2.5rem] flex flex-col items-center justify-center gap-4 transition-all duration-500 shadow-inner ${file ? 'bg-indigo-50/20 dark:bg-indigo-500/10 border-indigo-500 scale-[1.01]' : (expectedFilename ? 'bg-amber-50/30 dark:bg-amber-900/10 border-amber-300 dark:border-amber-600/50 animate-pulse' : 'bg-slate-50/50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700')}`}>
                      {isRestoringFile ? (
                        <div className="flex flex-col items-center gap-3">
                           <Loader2 size={32} className="animate-spin text-indigo-500"/>
                           <span className="text-sm font-black text-slate-500">Restoring from memory...</span>
                        </div>
                      ) : expectedFilename && !file ? (
                          <>
                             <FileUp size={32} className="text-amber-500" />
                             <div className="flex flex-col items-center">
                                <span className="text-sm md:text-base font-black px-6 text-center leading-tight text-amber-700 dark:text-amber-400">
                                   {t.restoreSettings || "Settings Restored"}
                                </span>
                                <span className="text-xs text-amber-600/70 dark:text-amber-500/70 mt-1">
                                    File not in memory. Please re-select: {expectedFilename}
                                </span>
                             </div>
                          </>
                      ) : (
                          <>
                            <Upload size={32} className={`transition-colors duration-300 ${file ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-300 dark:text-slate-600 group-hover:text-indigo-500'}`} />
                            <span className={`text-sm md:text-base font-black px-6 text-center leading-tight transition-colors duration-300 ${file ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600'}`}>
                                {file ? file.name : t.uploadPlaceholder}
                            </span>
                          </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                  <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">{t.sourceLang}</label><select value={settings.sourceLanguage} onChange={(e) => setSettings({...settings, sourceLanguage: e.target.value})} className="w-full p-4 md:p-5 rounded-2xl md:rounded-[1.5rem] bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 font-black text-sm outline-none focus:border-indigo-500 transition-all appearance-none shadow-sm">{Object.values(LANG_CODE_TO_LABEL).map(l => <option key={l} value={l}>{l}</option>)}<option value="Automatic">{t.autoDetect}</option></select></div>
                  <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">{t.targetLang}</label><select value={settings.targetLanguage} onChange={(e) => setSettings({...settings, targetLanguage: e.target.value})} className="w-full p-4 md:p-5 rounded-2xl md:rounded-[1.5rem] bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 font-black text-sm outline-none focus:border-indigo-500 transition-all appearance-none shadow-sm">{Object.values(LANG_CODE_TO_LABEL).map(l => <option key={l} value={l}>{l}</option>)}</select></div>
                </div>

                <div className="flex flex-col items-center gap-6">
                  {!isProcessing && !downloadUrl && (
                    <div className="w-full flex flex-col gap-4">
                        {canResume ? (
                           <button onClick={() => startTranslation(true)} className="w-full py-5 md:py-7 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl md:rounded-[2rem] font-black text-lg md:text-xl shadow-2xl shadow-indigo-500/30 active:scale-95 transition-all flex items-center justify-center gap-3">
                              <StepForward size={24}/> {t.resumeBtn} ({progress.currentPercent}%)
                           </button>
                        ) : (
                           <button 
                             onClick={handleMainAction} 
                             disabled={!file || isAnalyzing} 
                             className={`w-full py-5 md:py-7 text-white rounded-2xl md:rounded-[2rem] font-black text-lg md:text-xl shadow-2xl shadow-indigo-500/30 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-3 ${progress.strategy ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700'}`}
                           >
                             {isAnalyzing ? (
                               <Loader2 className="animate-spin" size={24} /> 
                             ) : progress.strategy ? (
                               <Play size={24} fill="currentColor"/>
                             ) : (
                               <Sparkles size={24} /> 
                             )}
                             {isAnalyzing ? t.analyzingBtn : (progress.strategy ? t.startBtn : t.analyzeBtn)}
                           </button>
                        )}
                    </div>
                  )}
                  {isProcessing && (<div className="w-full space-y-6 md:space-y-8 py-4"><ProgressBar progress={progress.currentPercent} /><button onClick={() => abortControllerRef.current?.abort()} className="mx-auto block px-10 md:px-14 py-3 rounded-full border-2 border-red-500/20 text-red-500 font-black text-[10px] uppercase hover:bg-red-50 dark:hover:bg-red-950/20 transition-all tracking-widest">{t.stopBtn}</button></div>)}
                  
                  <DownloadActions 
                    downloadUrl={downloadUrl} 
                    fileName={file?.name || 'book'} 
                    t={t} 
                  />
                  
                </div>
            </section>

            <div className="w-full grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-10">
              <section className="md:col-span-5 bg-white dark:bg-slate-900 rounded-[2rem] md:rounded-[3rem] border border-slate-200 dark:border-slate-800 p-8 md:p-10 space-y-6 shadow-sm relative overflow-hidden group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-indigo-600">
                    <Sparkles size={18}/>
                    <h3 className="text-[10px] md:text-[12px] font-black uppercase tracking-[0.2em]">{t.aiAnalysis}</h3>
                  </div>
                  {/* Show actions if file is present AND we have strategy (either analyzed or restored) */}
                  {file && progress.strategy && !isProcessing && (
                     <div className="flex gap-2">
                        <button onClick={handleAnalyzeAndStats} disabled={isAnalyzing} className="p-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors" title={t.reAnalyze}>
                           <RefreshCw size={14} className={isAnalyzing ? 'animate-spin' : ''} />
                        </button>
                        <button onClick={() => setIsRightDrawerOpen(true)} className="p-2 bg-slate-50 dark:bg-slate-800 text-slate-500 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title={t.changeModel}>
                           <SettingsIcon size={14} />
                        </button>
                     </div>
                  )}
                </div>
                
                <div className="min-h-[120px] md:min-h-[160px] flex flex-col justify-center">
                    {progress.strategy ? (
                    <div className="space-y-4 md:space-y-5 animate-fade-scale">
                        <div className="flex flex-wrap gap-2 items-center">
                          <div className="px-4 md:px-5 py-2 md:py-2.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl md:rounded-2xl inline-block border border-indigo-100 shadow-sm"><p className="text-[9px] md:text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">{progress.strategy.genre_translated}</p></div>
                          {analyzedModelId && (
                             <div className="px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl md:rounded-2xl inline-block border border-slate-200 dark:border-slate-700"><p className="text-[8px] md:text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1"><BrainCircuit size={10}/> {AI_MODELS.find(m => m.id === analyzedModelId)?.name || 'AI'}</p></div>
                          )}
                        </div>
                        <p className="text-xs md:text-sm italic text-slate-500 dark:text-slate-400 leading-relaxed text-justify serif">"{progress.strategy.strategy_translated}"</p>
                    </div>
                    ) : (
                        <div className="flex flex-col items-center gap-4 md:gap-5 opacity-20 py-8 md:py-10">
                          {isAnalyzing ? <Loader2 size={40} className="animate-spin text-indigo-500" /> : <BrainCircuit size={40} className="animate-pulse" />}
                          <p className="text-[10px] md:text-[11px] font-black uppercase tracking-widest">{isAnalyzing ? t.analyzingBtn : t.preparing}</p>
                        </div>
                    )}
                </div>
              </section>
              <section className="md:col-span-7 bg-white dark:bg-slate-900 rounded-[2rem] md:rounded-[3rem] border border-slate-200 dark:border-slate-800 p-8 md:p-10 flex flex-col h-[300px] md:h-[360px] shadow-sm">
                <div className="flex items-center gap-3 text-slate-400 mb-4 md:mb-6 border-b border-slate-50 dark:border-slate-800 pb-4 md:pb-5"><Activity size={18}/> <h3 className="text-[10px] md:text-[12px] font-black uppercase tracking-[0.2em]">{t.systemMonitor}</h3></div>
                <div className="flex-1 overflow-y-auto custom-scrollbar"><LogViewer logs={progress.logs} readyText={t.systemLogsReady} /></div>
              </section>
            </div>

            <section onClick={() => setIsLegalExpanded(!isLegalExpanded)} className={`w-full max-w-[680px] bg-white dark:bg-[#1a1405] rounded-[2.5rem] md:rounded-[3rem] border-2 transition-all duration-700 p-5 md:p-8 shadow-[0_10px_40px_-15px_rgba(245,158,11,0.15)] mb-12 relative overflow-hidden cursor-pointer group select-none hover:shadow-[0_15px_50px_-10px_rgba(245,158,11,0.2)] ${isLegalExpanded ? 'border-amber-400 ring-4 ring-amber-500/5' : 'border-slate-100 dark:border-amber-900/10'}`}>
                <div className="absolute -top-6 -right-6 md:-top-10 md:-right-10 pointer-events-none group-hover:scale-110 group-hover:rotate-6 transition-all duration-1000 opacity-20 dark:opacity-[0.08] select-none grayscale sepia">
                    <span className="text-[180px] md:text-[240px] leading-none">⚖️</span>
                </div>

                <div className="flex flex-col relative z-10">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-4">
                          <div className={`w-14 h-14 md:w-16 md:h-16 flex-shrink-0 flex items-center justify-center transition-all duration-500 rounded-2xl md:rounded-[1.4rem] shadow-lg ${isLegalExpanded ? 'bg-amber-500 text-white' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600'}`}><Shield size={24} /></div>
                          <h4 className="text-[13px] md:text-[15px] font-black uppercase tracking-[0.12em] text-slate-800 dark:text-amber-100 leading-tight">{t.legalWarningTitle}</h4>
                      </div>
                      <div className={`p-1.5 transition-all duration-500 ${isLegalExpanded ? 'text-amber-600 rotate-180' : 'text-slate-400 group-hover:text-amber-500'}`}><ChevronDown size={20} strokeWidth={3} /></div>
                    </div>
                    <div className="space-y-3">
                        <p className={`text-[11px] md:text-[12px] leading-relaxed font-bold italic transition-all duration-500 text-justify ${isLegalExpanded ? 'text-slate-900 dark:text-amber-50' : 'text-slate-500 dark:text-amber-100/50'}`}>{t.legalWarningText}</p>
                        <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 transition-all duration-700 overflow-hidden ${isLegalExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                          {t.legalPoints.map((point: string, idx: number) => (<div key={idx} className="flex gap-3 p-3 bg-slate-50/50 dark:bg-amber-950/10 rounded-xl border border-amber-100/50 dark:border-amber-800/20 hover:border-amber-400 transition-all"><div className="text-amber-500 font-black text-xs pt-0.5">{idx + 1}.</div><p className="text-[10px] md:text-[11px] leading-snug font-medium text-slate-600 dark:text-amber-100/80 text-justify">{point}</p></div>))}
                        </div>
                    </div>
                </div>
            </section>
        </div>
      </main>

      {isLangModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-slate-950/80 backdrop-blur-xl">
          <div className="bg-white dark:bg-slate-900 w-[95vw] max-w-4xl md:w-full rounded-[2rem] md:rounded-[3.5rem] border border-slate-200 dark:border-slate-800 shadow-[0_40px_120px_rgba(0,0,0,0.5)] animate-fade-scale flex flex-col max-h-[85vh] md:max-h-[90vh]">
            <div className="flex justify-between items-center p-6 md:p-8 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                <h3 className="text-lg md:text-2xl font-black tracking-tight text-slate-800 dark:text-slate-100 uppercase">{t.selectLang}</h3>
                <button onClick={() => setIsLangModalOpen(false)} className="p-2 md:p-4 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all hover:rotate-90 text-slate-400"><X size={24} /></button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-4 md:p-8 custom-scrollbar">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-5 pb-4">
                {LANGUAGES_DATA.map(l => (
                  <button 
                    key={l.code} 
                    onClick={() => { setUiLang(l.code as UILanguage); setIsLangModalOpen(false); localStorage.setItem('lit-trans-ui-lang', l.code) }} 
                    className={`group relative p-3 md:p-6 rounded-[1.2rem] md:rounded-[2rem] border-2 flex flex-col items-center justify-center gap-2 md:gap-3 transition-all duration-300 ${uiLang === l.code ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10 shadow-xl shadow-indigo-500/10 scale-[1.02]' : 'border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/50 hover:border-slate-200 dark:hover:border-slate-700 hover:scale-[1.01]'}`}
                  >
                    <span className="text-2xl md:text-5xl transition-transform duration-500 group-hover:scale-110 select-none">{l.flag}</span>
                    <span className={`text-[9px] md:text-[12px] font-black uppercase tracking-widest text-center transition-colors ${uiLang === l.code ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200'}`}>
                      {l.label}
                    </span>
                    {uiLang === l.code && (
                      <div className="absolute top-2 right-2 md:top-3 md:right-3 p-1 bg-indigo-500 rounded-full text-white shadow-lg">
                        <Check size={10} strokeWidth={4} />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[200] w-full max-w-md px-6 animate-shake">
          <div className="bg-red-600 text-white p-5 md:p-6 rounded-[1.5rem] md:rounded-[2rem] shadow-[0_20px_60px_rgba(220,38,38,0.4)] flex items-center gap-4 md:gap-5 border border-white/20"><div className="p-2 md:p-3 bg-white/20 rounded-xl md:rounded-2xl"><AlertCircle size={20} /></div><div className="flex-1"><h4 className="font-black text-[10px] md:text-xs uppercase tracking-widest">{error.title}</h4><p className="text-[10px] md:text-[11px] leading-snug opacity-95 mt-1">{error.message}</p></div><button onClick={() => setError(null)} className="p-1.5 md:p-2 hover:bg-white/10 rounded-lg md:rounded-xl transition-colors"><X size={16} /></button></div>
        </div>
      )}
    </div>
  );
}
