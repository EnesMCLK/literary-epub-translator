import React, { useState } from 'react';
import { X, BrainCircuit, Zap, ShieldCheck, ChevronRight, ExternalLink } from 'lucide-react';

interface OnboardingTourProps {
  isOpen: boolean;
  onClose: () => void;
  t: any;
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({ isOpen, onClose, t }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [imgError, setImgError] = useState(false);

  if (!isOpen) return null;

  const steps = t.tourSteps || [
    { title: "Welcome", desc: "AI Literary Translator" },
    { title: "Analysis", desc: "Smart detection" },
    { title: "Modes", desc: "Free vs Pro" },
    { title: "Privacy", desc: "Client side only" }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(c => c + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(c => c - 1);
    }
  };

  const icons = [
    <div className="flex items-center justify-center w-20 h-20">
        {!imgError ? (
            <img 
                src="https://drive.google.com/uc?export=view&id=1jA3BeptLdzzLEl_8VPF_WRPbR_N53vN-" 
                alt="App Logo" 
                className="w-full h-full object-contain drop-shadow-xl" 
                onError={() => setImgError(true)}
            />
        ) : (
            <span className="text-6xl select-none">📖</span>
        )}
    </div>,
    <Zap size={64} className="text-amber-500" strokeWidth={1.5} />,
    <BrainCircuit size={64} className="text-pink-500" strokeWidth={1.5} />,
    <ShieldCheck size={64} className="text-emerald-500" strokeWidth={1.5} />
  ];

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-white/20 relative overflow-hidden flex flex-col">
        
        {/* Close Button */}
        <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors z-20"
        >
            <X size={20} />
        </button>

        {/* Content */}
        <div className="flex-1 p-8 md:p-12 flex flex-col items-center text-center gap-6 md:gap-8 pt-16">
            <div className="w-32 h-32 rounded-[2rem] bg-slate-50 dark:bg-slate-800 flex items-center justify-center shadow-inner mb-2 animate-fade-scale">
                {icons[currentStep] || icons[0]}
            </div>
            
            <div className="space-y-4 animate-fade-scale flex flex-col items-center" key={currentStep}>
                <h2 className="text-2xl md:text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight leading-tight">
                    {steps[currentStep].title}
                </h2>
                <p className="text-sm md:text-base font-medium text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
                    {steps[currentStep].desc}
                </p>
                
                {/* API Key Step Action Button */}
                {currentStep === 1 && (
                    <a 
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 px-6 py-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-2 border border-indigo-200 dark:border-indigo-800/30"
                    >
                        {t.getApiKeyBtn || "GET FREE KEY"} <ExternalLink size={14} />
                    </a>
                )}
            </div>
        </div>

        {/* Footer / Controls */}
        <div className="p-8 pt-0 flex flex-col gap-8">
            {/* Dots */}
            <div className="flex justify-center gap-2">
                {steps.map((_: any, idx: number) => (
                    <div 
                        key={idx} 
                        className={`h-2 rounded-full transition-all duration-500 ${idx === currentStep ? 'w-8 bg-indigo-500' : 'w-2 bg-slate-200 dark:bg-slate-700'}`}
                    />
                ))}
            </div>

            <div className="flex items-center justify-between">
                <button 
                    onClick={handlePrev}
                    disabled={currentStep === 0}
                    className={`text-xs font-black uppercase tracking-widest px-4 py-3 rounded-xl transition-colors ${currentStep === 0 ? 'opacity-0 pointer-events-none' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                    {t.tourPrev}
                </button>

                <button 
                    onClick={handleNext}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95"
                >
                    {currentStep === steps.length - 1 ? t.tourFinish : t.tourNext}
                    {currentStep !== steps.length - 1 && <ChevronRight size={14} />}
                </button>
            </div>
        </div>

      </div>
    </div>
  );
};