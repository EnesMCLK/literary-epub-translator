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
                src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAJ5UlEQVR4AeybW2wjVxnH/2PnutndNJdld1l11fIEAlQhkSxCKqgPRUKgIh6R2PJI35YXKhD0pYAQ8FBUic0K+gBCSAWEKoFatVzakks3C9tu99JtNs3NjuPN1Zc4ie3xzJx+37hOpmmcxOd47LH3RP57xmfmnO87/985ZzyTJAT9EygHNJBA4QA0EA0kYA4ELB09QzSQgDkQsHT0DNFAAuZAwNLRM0QDCZgDAUvHnxkSsE42UjoaSMBoaSAaSMAcCFg6eoZoIAFzIGDp6BmigQTMgYClo2eIBhIwBwKWTiPNkIBZ5086Gog/vkq3qoFIW+dPRQ3EH1+lW9VApK3zp6IG4o+v0q36BiSTzj+dSZvLmZQpWOu0dZU0xfpuJaiMlE7khas12u7WKpUVlUgsm2Nri+Yz5XqdyYgTiSXzUmLVHE8lzfRH4nF8irdOcuNx3N3x+PNqMWaKtq5W8iJFSq7kYvT5B+Xiq5T7AmRqKv4SYDwF4ASpqi8hjB4I8UXHcb63GNlMLUU3n/AGWFnY+v5WKjsrhPNdQ4hzpOPe49XYN2CcgcDPY/OJt6rRnreNqgN58Z+XnwiHw1/1BvFv3+g2TXsoOpP5EsdYiq9/M5+zf0n7XSTfXyEj9Lk7U/GfVTNQVYG8/J83Bg04Q4ZhVDPHA9tyTOtvfFI2Y/+Rt7USd1M49g8nJxe/Xq2YVQPy8vDV0wUbr1QrsUrasSzRf+f68quOJSqfGZUE2uNcgmLAsP7y7uzdB/Y4XHGRMpDHJ8wL5yfMmVUrFA9D3FdxBlWqsOHYj1SpqQqaIRYw+PzOrQJmyYvo4xMFvnZymZSUgHxnovBjAePXn04uPNhrZT0JCM9+bXZb7drHpC8X2507Ztj4Smjzfsri6fMThV9sH6hwRwmIA1zgeH2pFG88ckeN53OT7tJ6BY/OGGapo0+WdirdKgGhYP1WzkHIIjT04V5/hT02nJ8WZ2X8UAUCBiITuHnq8GpQlCV4W+xZ2JT7ZyhlIMXw9+Y72++V8NiQjaS6PR8PvauBHNqqvU4kHJ5riO05JZfMSj0h0EA8JsrsEhKUJNw9mVZ26mggO15I7pVwGLA91xDJxuQuPLLB7qF60l3VM0TaOn8qaiD++CrdqhIQIeB9eiCdRLNUJDtcP9gX2T5pILLO7VWPiDAMFqy9Tji4TAmI8nA4OL/GO4NpsCSJKAFx4zaeZb5mzJ6wZIMoA1EJLpt0kOuxHyzZHJWAgJ9usmSjN1s9uoaoeqIERNBQEOAsms1Z2f6QG+wJSfKarnanTnHd67ps+s1Wj4emqif7zpADDXMzOPCse+uEkieSU0QJCI8GvWJ5xhvBYE9YntKKdhWB0JpZUTg/TyY3/Gz+kG2711UFIopA9KOT3ZyYBWt3+WE/KwFxl6tgDMzD9tf/89gPlmQkJSA8EliSsZuuGnNgP1iynVMGIhu4KesREYbBku2fEhD3JkQlumzWQa7HfrAkc1QCwnFZkrGbshr7wZJ82Kvv1Ks9KhgGS/K+sApAKu5Rc1dgGCzZXiotWYG6htAFVdaEqtZjGizJRpWAuHEDYkQQ0mA/SpLkobhk0e9COAHZ4M1YT7AnJNm+Kc2QnTv1+o9P/vtBWROqVc/Nga1gSTaqBIRnRzG2m0oxBSqwLe+fHReL/X73ZOB3qO32HYc6u/2p+FzP9YSLC54DFewqAqGnvZyBJ6BwQkilNj0ltdnlP0KvTaSdKNmcCcdm90tlRT/4iW+ppNKtEpCdJasYVtjUnG1gMZ7AyvLuf3MrntMs7+n0JjYyORQKDj40U5gPS7Kj5KBkTarmTo5ScIbh0MJBM0QQlNvX53HjzQhm31vC3NTyjqZpv4wi0ytwNUPbMlqYX0MysYE8jU5Koewrly0gldzC4t11xOaTiEX31kI0BVfztD1IMTonlsT01BLi8bQLwzIdsAQtX2wFe8Iqm9gBB5SBuMHpW4VgGASFYYCh0OfEygYiM6uYKxldblvG/Ii3fJYgkWbeW8TtG1Fc+/805qPLdCvENhTXb+6rEA4ic6u4dT2GqYklRGcSWIiQkSXjS9uDzOfjLoAU4rTdURrpZA5WwUaBYGyLZgqvGOwHi3ORkSIQAWEI5O0WgGEQBBcGzRA6IJNPRXUW40lMTsRgCAG3IuXyzo0FLNOssG0HNq3vQsUdt9GPvnG7DIJnhiuCwdvNvHAHCMesy6MT0OA0wiHM5zogGAZDqRGMkk3ZLRNLy0nwRX2OZmMua9KabtPF1iHZLhTHDyiWKM4QgsFwWHeyYZqqlBn5Qu9SL8UZAhghA+N2P6K5ziKUKvwXESr8WVvNIJe3sUZLJI9erxzbJjAO5UbraoXtHnS6bTngmcG6ngphPEsDk2Co8FcGwsFb+9rxV+fjeGGzD2P5Y3ijBhpdb8eLN9c+0CpeGI1ici2LdxY38fb8Bm6tA7cKHbhGs/fqVjsub3ZgdKMdwxsdVdW/ku34Q6ILz1s9YC9Kqsvjd28Grd2tiJ3oxVt9J/FmDcRx/jufwevRDF6dzeDP15bw3PhdPDcWx+9GYniloxev9ZzCcM9JjNz3MYx19+Py8T5cOd5bVV093oNIZxctVR9MjW0iB82vvY9XZYaUcqjlFm1t6Ow5gvauMNqOhNHaEUK4LYRQq4FQWwva+7q946Xm+8ZmfgMSPyGJOttVnMRWzTvqhX7soU/SxdxAS0sIoXAI4bBBWwNnHnmornk56RzMhYTUnbESEOvmXYitQt0639LXi54vfwHtZ06ipbMVXWdP4/7HHsbRB07VLSeRt2DdiMM2w1IP9JSAiA1z1RqbgU0JOFMrqKUEfaPir92hjg4c/eyn0P/ow+gZ/Axajh6h9ZxedJdey3w4ln0zDmt0Bk4mlx377eejkPhRA2LgWUFf/Rx6jGBPraKWst6OwUnxkiloNuwSPWOyr8Vqmg/33VlIQ5g0MQSekWDhVlECMnJx8CeOgws0Hmfd1mr5Rnfh9pUI7NuLEKksBN2gCVq7ncllWONzcI1RzqeyBuj6Ng+Bp0aGzv2ospo7ZysB4WZGLw0+O3zx3CeGLw4atZQjjEc5voilYP8vAvu1SdhX5uDMJQCHZoxjfKuW+XCskaHBs8NDgz/lvGSlDEQ2sGq90aGBf9O992PUziJp5yWQpg/fHrk08DxtG+7VsEDY6dGLg/+gkXkahvE1IYwnIYxvhLInTlHZn/h4I6qhgZQMH/7NwEsjQwO/Gh4a+Pvrv38wVypvxG1TAGlE48vlrIGUc6ZO5RpInYwvF1YDKedMnco1kDoZXy6sBlLOGR/L92taA9nPnToc00DqYPp+ITWQ/dypwzENpA6m7xdSA9nPnToc00DqYPp+ITWQ/dypwzENpA6m7xfyfQAAAP//kGxt+QAAAAZJREFUAwDuf/JB+D6AMQAAAABJRU5ErkJggg==" 
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