import React from 'react';

const formatDurationForCard = (seconds) => {
  if (isNaN(seconds) || seconds <= 0) return "00:00";
  return new Date(seconds * 1000).toISOString().substring(11, 19).replace(/^(00:)+/, "");
};

export default function TrustMediaCard({ platform, title, duration }) {
  const getGradient = (p) => {
    switch (p) {
      case "instagram": return "from-fuchsia-600/30 to-orange-500/30 border-fuchsia-500/40";
      case "facebook": return "from-blue-600/30 to-blue-400/30 border-blue-500/40";
      default: return "from-red-600/30 to-red-400/30 border-red-500/40"; // Youtube Default
    }
  };

  const getIcon = (p) => {
    switch (p) {
      case "instagram": return "📸";
      case "facebook": return "📘";
      default: return "🎥";
    }
  };

  const getBadgeText = (p) => {
    switch (p) {
      case "instagram": return "INSTAGRAM REEL";
      case "facebook": return "FACEBOOK VIDEO";
      default: return "YOUTUBE VIDEO";
    }
  };

  return (
    <div className={`w-full sm:w-48 flex-shrink-0 aspect-video rounded-xl border bg-gradient-to-br ${getGradient(platform)} flex flex-col justify-between p-3 sm:p-4 shadow-xl backdrop-blur-md relative overflow-hidden group`}>
      {/* Glossy overlay hover effect */}
      <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      
      {/* Top Header Row */}
      <div className="flex justify-between items-start z-10 w-full mb-2">
        <span className="text-2xl sm:text-3xl drop-shadow-md leading-none" title={getBadgeText(platform)}>
          {getIcon(platform)}
        </span>
        <span className="bg-black/50 backdrop-blur-md px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-bold font-mono tracking-wider text-white border border-white/10 shadow-sm flex-shrink-0">
          {formatDurationForCard(duration)}
        </span>
      </div>
      
      {/* Bottom Typography Block */}
      <div className="z-10 mt-auto flex flex-col min-w-0">
         <p className="text-[9px] sm:text-[10px] uppercase font-bold tracking-widest opacity-80 mb-0.5 sm:mb-1 truncate text-white">
           {getBadgeText(platform)}
         </p>
         <h3 className="font-bold text-xs sm:text-sm line-clamp-2 leading-tight break-words drop-shadow-md text-white">
           {title || "Unknown Media"}
         </h3>
      </div>
    </div>
  );
}
