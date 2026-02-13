
import React from 'react';
import { History, X, Database } from 'lucide-react';
import { HistoryItem, TranslationSettings } from '../design';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryItem[];
  onClearHistory: () => void;
  onRestoreSettings: (item: HistoryItem) => void;
  t: any; // UI Strings
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  history,
  onClearHistory,
  onRestoreSettings,
  t
}) => {
  return (
    <aside className={`fixed top-0 left-0 h-full w-80 bg-white dark:bg-slate-900 z-[80] shadow-2xl transition-transform duration-300 transform border-r border-slate-200 dark:border-slate-800 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex flex-col h-full">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <h3 className="text-xs font-black tracking-widest text-indigo-600 uppercase flex items-center gap-2">
            <History size={16}/> {t.historyTitle}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X size={18}/>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {history.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-30">
              <Database size={40} />
              <p className="text-[10px] font-black uppercase mt-4">{t.noHistory}</p>
            </div>
          ) : (
            <>
              <button 
                onClick={onClearHistory} 
                className="w-full py-2 text-[10px] font-black text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg uppercase transition-colors mb-2"
              >
                {t.clearHistory}
              </button>
              {history.map(item => (
                <div 
                  key={item.id} 
                  onClick={() => onRestoreSettings(item)} 
                  className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-indigo-400 cursor-pointer group relative"
                >
                  <p className="text-[11px] font-black truncate text-slate-700 dark:text-slate-200">{item.filename}</p>
                  <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-200/50">
                      <span className="text-[9px] font-bold text-slate-400">{item.sourceLang} → {item.targetLang}</span>
                      <span className="text-[8px] font-black text-indigo-500 uppercase">{t.restoreSettings}</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </aside>
  );
};
