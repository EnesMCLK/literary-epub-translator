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
          <span className="text-2xl md:text-4xl group-hover:scale-110 transition-transform shrink-0">📖</span>
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