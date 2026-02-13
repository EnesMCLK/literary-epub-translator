import { 
  Upload, Download, Play, Pause, AlertCircle, CheckCircle2, 
  Settings, Sliders, Tags, Loader2, Clock, CircleDot, 
  History, BrainCircuit, Sparkles, ChevronRight,
  ShieldCheck, Info, XCircle, RefreshCw, Check, Globe, X,
  Zap, BarChart3, Scale, ShieldAlert, Activity, BookOpen, User, Trash2, StepForward,
  Key, LayoutDashboard, Database, Link2, Menu, Lock, Unlock, ExternalLink, Eye, EyeOff,
  BookType, Sun, Moon, Copyright, Heart, Shield, Gavel, ChevronDown, ChevronUp, Wand2,
  Timer, Gauge
} from 'lucide-react';

// --- Types ---

export type UILanguage = 'tr' | 'en' | 'fr' | 'de' | 'es' | 'it' | 'ru' | 'zh' | 'ja' | 'ko' | 'ar' | 'pt' | 'nl' | 'pl' | 'hi' | 'vi';

export interface TranslationSettings {
  temperature: number;
  targetTags: string[];
  sourceLanguage: string;
  targetLanguage: string;
  modelId?: string;
  uiLang: UILanguage;
  hasPaidKey?: boolean;
}

export interface ResumeInfo {
  filename: string;
  zipPathIndex: number;
  nodeIndex: number;
  translatedNodes: Record<string, string[]>;
  settings: TranslationSettings;
  totalProcessedSentences?: number; // Kaldığı yerden devam ederken cümle sayısını korumak için
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  filename: string;
  sourceLang: string;
  targetLang: string;
  modelId: string;
  wordCount?: number;
  status: 'completed' | 'partial' | 'failed';
  settingsSnapshot: TranslationSettings;
}

export interface BookStats {
  totalChars: number;
  totalWords: number;
  totalSentences: number; // Tahmini
  estimatedTokens: number;
  estimatedChunks: number;
  estimatedDurationFree: number; // Dakika cinsinden (Worst case)
  estimatedDurationPro: number; // Dakika cinsinden (Best case)
  fileSentenceCounts?: number[]; // Her dosyanın cümle sayısı (Progress bar hassasiyeti için)
}

export interface BookStrategy {
  genre_en: string;
  tone_en: string;
  author_style_en: string;
  strategy_en: string;
  genre_translated: string;
  tone_translated: string;
  author_style_translated: string;
  strategy_translated: string;
  literary_fidelity_note: string;
  detected_creativity_level: number;
  isFallback?: boolean; // Kota aşımı nedeniyle varsayılan strateji mi kullanıldı?
}

export interface LogEntry {
  timestamp: string;
  text: string;
  type?: 'info' | 'success' | 'warning' | 'error' | 'live';
}

export interface UsageStats {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  promptTokensDetails?: any;
  candidatesTokensDetails?: any;
}

// --- Constants ---

export const STORAGE_KEY_API = 'lit-trans-api-key';
export const AVAILABLE_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'div', 'span', 'em', 'strong', 'td', 'th', 'caption', 'figcaption', 'aside', 'section', 'article'];
export const DEFAULT_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'div', 'td', 'th', 'figcaption', 'aside'];

export const LANGUAGES_DATA = [
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' }, { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' }, { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', label: 'Español', flag: '🇪🇸' }, { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' }, { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' }, { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' }, { code: 'pt', label: 'Português', flag: '🇵🇹' },
  { code: 'nl', label: 'Nederlands', flag: '🇳🇱' }, { code: 'pl', label: 'Polski', flag: '🇵🇱' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' }, { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' }
];

export const LANG_CODE_TO_LABEL: Record<string, string> = {
  tr: 'Turkish', en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian',
  ru: 'Russian', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', ar: 'Arabic', pt: 'Portuguese',
  nl: 'Dutch', pl: 'Polish', hi: 'Hindi', vi: 'Vietnamese'
};

export const AI_MODELS = [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.5 Flash', desc: 'API Key Required', locked: true }, // LOCKED
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', desc: 'Balanced', locked: true }, 
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', desc: 'Expert', locked: true }        
];

// --- Global Interface Extension ---
declare global {
  interface Window {
    manualApiKey: string;
  }
}