
import React, { useEffect, useState } from 'react';
import { History, X, Database, CheckCircle2, AlertCircle, PauseCircle, HardDrive, Trash2 } from 'lucide-react';
import { HistoryItem } from '../design';
import { fileStorage, StorageUsage } from '../services/storageService';

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
  const [usage, setUsage] = useState<StorageUsage>({ usedBytes: 0, fileCount: 0 });

  // Update usage when drawer opens
  useEffect(() => {
    if (isOpen) {
        fileStorage.getUsage().then(setUsage).catch(console.error);
    }
  }, [isOpen, history]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

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
        
        {/* Storage Stats */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
             <div className="flex justify-between items-center mb-2">
                <span className="text-[9px] font-black uppercase text-slate-400 flex items-center gap-1.5"><HardDrive size={10} /> {t.localMemory}</span>
                <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300">{formatSize(usage.usedBytes)}</span>
             </div>
             <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                <div 
                    className="bg-indigo-500 h-1.5 rounded-full transition-all duration-1000" 
                    style={{ width: `${Math.min(100, Math.max(2, (usage.usedBytes / (100 * 1024 * 1024)) * 100))}%` }} 
                />
             </div>
             <p className="text-[8px] text-slate-400 mt-1.5 italic text-right">{t.booksCached?.replace('{0}', usage.fileCount) || `${usage.fileCount} books cached`}</p>
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
                className="w-full py-3 text-[10px] font-black text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl uppercase transition-colors mb-2 border border-transparent hover:border-red-100 dark:hover:border-red-900/30 flex items-center justify-center gap-2"
              >
                <Trash2 size={12} /> {t.clearHistory}
              </button>
              {history.map(item => {
                const isSuccess = item.status === 'completed';
                const isPartial = item.status === 'partial';

                let Icon = AlertCircle;
                let colorClass = "text-red-500";
                let borderClass = "border-red-100 dark:border-red-900/30 hover:border-red-400";
                
                if (isSuccess) {
                    Icon = CheckCircle2;
                    colorClass = "text-green-500";
                    borderClass = "border-slate-100 dark:border-slate-800 hover:border-indigo-400";
                } else if (isPartial) {
                    Icon = PauseCircle;
                    colorClass = "text-amber-500";
                    borderClass = "border-amber-100 dark:border-amber-900/30 hover:border-amber-400";
                }

                // Translate 'Automatic' source language if present
                const displaySource = item.sourceLang === 'Automatic' ? t.autoDetect : item.sourceLang;

                return (
                  <div 
                    key={item.id} 
                    onClick={() => onRestoreSettings(item)} 
                    className={`p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border cursor-pointer group relative transition-all active:scale-[0.98] ${borderClass}`}
                  >
                    <div className="flex justify-between items-start gap-2 mb-2">
                         <p className="text-[11px] font-black truncate text-slate-700 dark:text-slate-200 leading-tight line-clamp-2" title={item.filename}>{item.filename}</p>
                         <Icon size={14} className={`${colorClass} shrink-0`} />
                    </div>
                    
                    <div className="flex items-center gap-2 mb-3 opacity-70">
                        <span className="text-[9px] font-mono text-slate-500 dark:text-slate-400">{item.timestamp.split(',')[0]}</span>
                        <div className="w-1 h-1 rounded-full bg-slate-300"></div>
                        <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase">{item.modelId.replace('gemini-', '')}</span>
                        {(item.wordCount || 0) > 0 && (
                            <>
                                <div className="w-1 h-1 rounded-full bg-slate-300"></div>
                                <span className="text-[9px] font-mono text-slate-400">{item.wordCount?.toLocaleString()}w</span>
                            </>
                        )}
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                        <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
                            {item.hasSavedFile && <HardDrive size={10} className="text-indigo-500" />}
                            {displaySource} → {item.targetLang}
                        </span>
                        <span className="text-[8px] font-black text-indigo-500 uppercase opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0">{t.restoreSettings}</span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </aside>
  );
};
