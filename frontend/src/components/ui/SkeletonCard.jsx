import React from 'react';

export default function SkeletonCard({ currentTheme }) {
  return (
    <div className={`flex flex-col rounded-xl overflow-hidden border border-white/5 ${currentTheme.rowBg}`}>
      <div className="flex flex-col sm:flex-row gap-4 p-3 sm:p-4 opacity-70">
        
        {/* Fake Checkbox Box */}
        <div className="flex-shrink-0 pl-1 w-8 flex justify-center items-center">
            <div className="w-5 h-5 rounded bg-white/5 overflow-hidden relative">
              <div className="absolute inset-0 shimmer-bg animate-shimmer"></div>
            </div>
        </div>

        {/* Fake Thumbnail */}
        <div className="relative w-28 sm:w-36 aspect-video rounded-lg overflow-hidden bg-white/5 flex-shrink-0">
           <div className="absolute inset-0 shimmer-bg animate-shimmer"></div>
           {/* Fake Duration Pill */}
           <div className="absolute bottom-1 right-1 w-8 h-3 rounded bg-black/40"></div>
        </div>

        {/* Fake Metadata */}
        <div className="flex-1 min-w-0 flex flex-col justify-center py-1 gap-2">
           <div className="w-3/4 h-4 rounded bg-white/10 relative overflow-hidden">
             <div className="absolute inset-0 shimmer-bg animate-shimmer"></div>
           </div>
           <div className="w-1/2 h-4 rounded bg-white/10 relative overflow-hidden mb-1">
             <div className="absolute inset-0 shimmer-bg animate-shimmer"></div>
           </div>
           
           <div className="w-1/3 h-3 rounded bg-white/5 relative overflow-hidden">
             <div className="absolute inset-0 shimmer-bg animate-shimmer"></div>
           </div>
        </div>

        {/* Fake Gear Icon */}
        <div className="flex-shrink-0 pr-1 flex justify-center items-center w-8">
           <div className="w-6 h-6 rounded-full bg-white/5 relative overflow-hidden">
             <div className="absolute inset-0 shimmer-bg animate-shimmer"></div>
           </div>
        </div>
      </div>
    </div>
  );
}
