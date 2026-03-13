import React, { useState } from 'react';
import { 
  Settings, X, LayoutDashboard, Sun, Moon, Globe, Key, Lock, Unlock, Zap, 
  Eye, EyeOff, Loader2, ShieldCheck, Sliders, Check, ExternalLink, Trash2, Save
} from 'lucide-react';
import { TranslationSettings, AI_MODELS, UILanguage, STORAGE_KEY_TIER } from '../design';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  t: any; // UI Strings
  settings: TranslationSettings;
  onUpdateSettings: (newSettings: TranslationSettings) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  uiLang: UILanguage;
  onOpenLangModal: () => void;
  hasPaidKey: boolean;
  manualKey: string;
  setManualKey: (key: string) => void;
  isVerifying: boolean;
  onVerifyKey: () => void;
  onConnectAiStudio: () => void;
  onClearKey: () => void;
  isPaidTier: boolean;
  setIsPaidTier: (isPaid: boolean) => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  t,
  settings,
  onUpdateSettings,
  isDarkMode,
  onToggleTheme,
  uiLang,
  onOpenLangModal,
  hasPaidKey,
  manualKey,
  setManualKey,
  isVerifying,
  onVerifyKey,
  onConnectAiStudio,
  onClearKey,
  isPaidTier,
  setIsPaidTier
}) => {
  const [showKey, setShowKey] = useState(false);

  // Model ID'ye göre çeviri anahtarını eşleştir
  const getModelDesc = (modelId: string) => {
    if (modelId === 'gemini-2.5-flash') return t.modelDescPricePerf || 'Fast, Price & Performance';
    if (modelId === 'gemini-3-flash-preview') return t.modelDescBalanced || 'Fast & Balanced';
    if (modelId === 'gemini-3-pro-preview') return t.modelDescExpert || 'Expert';
    if (modelId === 'gemini-3.1-flash-lite-preview') return t.modelDescNewFast || 'New & Fast';
    if (modelId === 'gemini-3.1-pro-preview') return t.modelDescNewExpert || 'New & Expert';
    return '';
  };

  const hasKeySaved = hasPaidKey || (manualKey && manualKey.length > 10);

  return (
    <aside className={`fixed top-0 right-0 h-full w-80 bg-white dark:bg-slate-900 z-[80] shadow-2xl transition-transform duration-300 transform border-l border-slate-200 dark:border-slate-800 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="flex flex-col h-full">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <h3 className="text-xs font-black tracking-widest text-indigo-600 uppercase flex items-center gap-2">
            <Settings size={16}/> {t.settingsTitle}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X size={18}/>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          
          {/* Interface Settings */}
          <div className="space-y-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <LayoutDashboard size={12}/> {t.interfaceSettings}
            </label>
            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-3xl border border-slate-100 dark:border-slate-700/50 space-y-5">
              <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase">{t.themeMode}</span>
                  <button onClick={onToggleTheme} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400 transition-all hover:scale-105 active:scale-95">
                    {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
                    <span className="text-[10px] font-black uppercase">{isDarkMode ? t.themeLight : t.themeDark}</span>
                  </button>
              </div>
              <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase">{t.appLanguage}</span>
                  <button onClick={onOpenLangModal} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl shadow-sm transition-all hover:bg-indigo-700 active:scale-95">
                    <Globe size={14} />
                    <span className="text-[10px] font-black uppercase">{uiLang.toUpperCase()}</span>
                  </button>
              </div>
            </div>
          </div>

          {/* API & Key Status */}
          <div className="space-y-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Key size={12}/> {t.apiStatus}
            </label>
            <div className={`p-5 rounded-[2rem] border-2 transition-all duration-500 shadow-lg ${hasPaidKey ? 'bg-indigo-50/50 dark:bg-indigo-950/40 border-indigo-500/50' : 'bg-white dark:bg-slate-800/60 border-slate-100 dark:border-slate-700/50'}`}>
              <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px] ${hasPaidKey ? 'bg-green-500 animate-pulse shadow-green-500/50' : 'bg-amber-500 shadow-amber-500/50'}`}></div>
                    <span className={`text-[10px] font-black uppercase tracking-wider ${hasPaidKey ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-300'}`}>{hasPaidKey ? t.paidMode : t.freeMode}</span>
                  </div>
                  <div className="p-1.5 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  {hasPaidKey ? <Unlock size={14} className="text-indigo-500" /> : <Lock size={14} className="text-slate-400 dark:text-slate-500" />}
                  </div>
              </div>
              <button onClick={onConnectAiStudio} className="w-full flex items-center justify-center gap-2.5 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-[11px] uppercase transition-all shadow-xl shadow-indigo-600/20 active:scale-[0.98] disabled:opacity-50 mb-6 group">
                <Zap size={14} className="group-hover:animate-pulse" fill="currentColor"/> {t.connectAiStudio}
              </button>
              <div className="space-y-3.5 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                <div className="flex justify-between items-center px-1">
                   <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em]">{t.manualKeyLabel}</label>
                   <a 
                     href="https://aistudio.google.com/app/apikey" 
                     target="_blank" 
                     rel="noopener noreferrer"
                     className="text-[9px] font-bold text-indigo-500 hover:text-indigo-600 flex items-center gap-1 hover:underline"
                   >
                     {t.getApiKeyLink} <ExternalLink size={10} />
                   </a>
                </div>
                <div className="relative group">
                    <input 
                      type={showKey ? "text" : "password"} 
                      value={manualKey} 
                      onChange={(e) => setManualKey(e.target.value)} 
                      placeholder={t.manualKeyPlaceholder} 
                      className={`w-full bg-slate-50 dark:bg-slate-900/80 border-2 rounded-2xl py-4 pl-4 pr-12 text-[12px] font-mono outline-none focus:ring-4 transition-all shadow-inner ${hasKeySaved ? 'border-green-500/30 focus:border-green-500 focus:ring-green-500/10 text-green-700 dark:text-green-300' : 'border-slate-100 dark:border-slate-700 focus:border-indigo-500 focus:ring-indigo-500/10 text-slate-700 dark:text-slate-200'}`} 
                    />
                    <button onClick={() => setShowKey(!showKey)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500 transition-colors p-1.5">
                      {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    {hasKeySaved && <div className="absolute right-10 top-1/2 -translate-y-1/2 text-green-500 pointer-events-none"><Check size={14} /></div>}
                </div>
                <div className="flex gap-2">
                    <button 
                    onClick={onVerifyKey} 
                    disabled={isVerifying || !manualKey} 
                    className={`flex-1 py-4 text-white rounded-2xl font-black text-[11px] uppercase flex items-center justify-center gap-2.5 active:scale-[0.98] disabled:opacity-40 transition-all shadow-lg ${hasKeySaved ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-900 dark:bg-indigo-600/90 hover:bg-black dark:hover:bg-indigo-500'}`}
                    >
                    {isVerifying ? <Loader2 size={16} className="animate-spin" /> : (hasKeySaved ? <Save size={16} /> : <ShieldCheck size={16} />)} {isVerifying ? t.checkKey : (hasKeySaved ? "SAVED" : t.verifyBtn)}
                    </button>
                    {(hasPaidKey || manualKey) && (
                        <button 
                          onClick={onClearKey}
                          className="px-4 py-4 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-2xl transition-all"
                          title={t.removeKey}
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                </div>
                {hasPaidKey && (
                  <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{t.tierToggleLabel || 'API Key Type'}</label>
                      <button 
                        onClick={() => {
                          const newValue = !isPaidTier;
                          setIsPaidTier(newValue);
                          localStorage.setItem(STORAGE_KEY_TIER, newValue ? 'paid' : 'free');
                          if (!newValue && settings.modelId !== 'gemini-2.5-flash') {
                            onUpdateSettings({ ...settings, modelId: 'gemini-2.5-flash' });
                          }
                        }}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${isPaidTier ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                      >
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isPaidTier ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    <div className="flex justify-between text-[9px] font-bold">
                      <span className={!isPaidTier ? 'text-amber-500' : 'text-slate-400'}>{t.tierFree || 'Free Tier'}</span>
                      <span className={isPaidTier ? 'text-indigo-500' : 'text-slate-400'}>{t.tierPaid || 'Paid Tier'}</span>
                    </div>
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-2 leading-relaxed">
                      {t.tierToggleDesc || 'Free tier applies rate limits and unlocks only Gemini 2.5 Flash.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Model Selection */}
          <div className="space-y-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Sliders size={12}/> {t.modelLabel}
            </label>
            <div className="grid grid-cols-1 gap-2">
              {AI_MODELS.map(m => {
                const isLocked = m.locked && (!hasPaidKey || (!isPaidTier && m.id !== 'gemini-2.5-flash'));
                return (
                <button 
                  key={m.id} 
                  disabled={isLocked} 
                  onClick={() => onUpdateSettings({...settings, modelId: m.id})} 
                  className={`p-4 rounded-2xl border-2 text-left transition-all relative overflow-hidden ${settings.modelId === m.id ? 'border-indigo-500 bg-indigo-50/20 dark:bg-indigo-900/10' : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'}`}
                >
                  {isLocked && <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/70 flex items-center justify-center backdrop-blur-[1px]"><Lock size={12} className="text-slate-400 dark:text-slate-500" /></div>}
                  <div className="flex justify-between items-center">
                    <div>
                        <span className={`text-[10px] font-black block ${settings.modelId === m.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300'}`}>{m.name}</span>
                        <span className="text-[9px] font-medium text-slate-400">{getModelDesc(m.id)}</span>
                    </div>
                    {settings.modelId === m.id && <Check size={12} className="text-indigo-500" />}
                  </div>
                </button>
              )})}
            </div>
          </div>

        </div>
      </div>
    </aside>
  );
};