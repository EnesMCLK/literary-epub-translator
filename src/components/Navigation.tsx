import React from 'react';
import { History, Settings, Github, HelpCircle } from 'lucide-react';

interface NavigationProps {
  onOpenLeftDrawer: () => void;
  onOpenRightDrawer: () => void;
  onOpenTour: () => void;
  title: string;
  description: string;
}

export const Navigation: React.FC<NavigationProps> = ({ 
  onOpenLeftDrawer, 
  onOpenRightDrawer,
  onOpenTour,
  title, 
  description 
}) => {
  return (
    <nav className="h-16 md:h-20 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl fixed top-0 w-full z-50 flex items-center px-4 md:px-6">
      <div className="flex-1 flex justify-start items-center">
        <button 
          onClick={onOpenLeftDrawer} 
          className="p-2 md:p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl md:rounded-2xl transition-all text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 active:scale-90 shrink-0"
        >
          <History size={20} className="md:w-6 md:h-6" />
        </button>
      </div>
      <div className="flex flex-col items-center flex-shrink min-w-0 px-2 group overflow-hidden">
        <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
          <img src="data:image/png;base64,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" alt="Logo" className="w-8 h-8 md:w-10 md:h-10 group-hover:scale-110 transition-transform shrink-0" referrerPolicy="no-referrer" />
          <div className="flex flex-col items-center min-w-0">
            <h1 className="font-black tracking-tight text-sm md:text-xl uppercase bg-clip-text text-transparent bg-gradient-to-br from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 truncate w-full text-center leading-tight">
              {title}
            </h1>
            <p className="hidden lg:block text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
              {description}
            </p>
          </div>
        </div>
      </div>
      <div className="flex-1 flex justify-end items-center gap-2">
        <button 
          onClick={onOpenTour}
          className="hidden sm:flex p-2 md:p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl md:rounded-2xl transition-all text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 active:scale-90 shrink-0"
          title="Help / Tour"
        >
          <HelpCircle size={20} className="md:w-6 md:h-6" />
        </button>
        <a 
          href="https://github.com/EnesMCLK/literary-epub-translator"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:flex p-2 md:p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl md:rounded-2xl transition-all text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 active:scale-90 shrink-0"
          title="View on GitHub"
        >
          <Github size={20} className="md:w-6 md:h-6" />
        </a>
        <button 
          onClick={onOpenRightDrawer} 
          className="p-2 md:p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl md:rounded-2xl transition-all text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 active:scale-90 shrink-0"
        >
          <Settings size={20} className="md:w-6 md:h-6" />
        </button>
      </div>
    </nav>
  );
};