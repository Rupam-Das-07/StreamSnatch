import React, { useState } from "react";

// Helper functions for formatting data from the backend
const formatDuration = (seconds) => {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  return new Date(seconds * 1000)
    .toISOString()
    .substr(11, 8)
    .replace(/^(00:)+/, "");
};

const formatViews = (views) => {
  if (!views) return "0";
  if (views < 1000) return views.toLocaleString();
  if (views < 1000000) return `${(views / 1000).toFixed(1)}K`;
  if (views < 1000000000) return `${(views / 1000000).toFixed(1)}M`;
  return `${(views / 1000000000).toFixed(1)}B`;
};

const formatAudioBitrate = (format) => {
  if (!format.bitrate) return "Unknown";

  if (typeof format.bitrate === 'string') {
    let cleaned = format.bitrate.replace(/kb\s*ps/i, "kbps");
    if (cleaned.includes("kbps")) return cleaned;
  }

  const bitrateStr = String(format.bitrate).replace(/[^\d.]/g, '');
  const bitrate = parseInt(bitrateStr);
  if (isNaN(bitrate)) return String(format.bitrate).replace(/kb\s*ps/i, "kbps");

  const standardBitrates = [32, 64, 96, 128, 160, 192, 256, 320];
  const closestBitrate = standardBitrates.reduce((prev, curr) =>
    Math.abs(curr - bitrate) < Math.abs(prev - bitrate) ? curr : prev
  );

  if (Math.abs(bitrate - closestBitrate) <= 10) {
    return `${closestBitrate} kbps`;
  }

  return `${bitrate} kbps`;
};


const formatAudioCodec = (format) => {
  if (!format.codec) return "";

  const codecMap = {
    "mp4a.40.2": "AAC",
    opus: "Opus",
    vorbis: "Vorbis",
    mp3: "MP3",
    aac: "AAC",
  };

  const codec = format.codec.toLowerCase();
  return codecMap[codec] || format.codec.toUpperCase();
};

const formatUploadDate = (dateStr) => {
  if (!dateStr) return null;
  if (/^\d{8}$/.test(dateStr)) {
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(4, 6);
    const day = dateStr.slice(6, 8);
    const dateObj = new Date(`${year}-${month}-${day}T00:00:00`);
    return isNaN(dateObj) ? dateStr : dateObj.toLocaleDateString();
  }
  const dateObj = new Date(dateStr);
  return isNaN(dateObj) ? dateStr : dateObj.toLocaleDateString();
};

const FormatCard = ({
  format,
  isAudio,
  hasError,
  currentTheme,
  onDownloadClick,
  isDownloadingAny,
}) => {
  const renderPrimaryLabel = () => {
    if (isAudio) {
      return (
        <span className="font-extrabold text-[15px] sm:text-base leading-tight break-words tracking-tight">
          {formatAudioBitrate(format)}
        </span>
      );
    }

    // Safely extract height from backend format height OR resolution string
    let h = format.height || 0;
    if (!h && format.resolution && typeof format.resolution === "string" && format.resolution.includes("x")) {
      const match = format.resolution.match(/(\d+)x(\d+)/);
      if (match) {
        h = parseInt(match[2], 10);
      }
    }

    let resolutionLabel = "Unknown";
    let badge = null;

    if (h >= 1900) {
      resolutionLabel = "2160p";
      badge = "4K";
    } else if (h >= 1200) {
      resolutionLabel = "1440p";
      badge = "2K";
    } else if (h >= 900) { // catches 1012 -> 1080p
      resolutionLabel = "1080p";
      badge = "FHD";
    } else if (h >= 600) { // catches cropped 720p
      resolutionLabel = "720p";
      badge = "HD";
    } else if (h >= 400) { 
      resolutionLabel = "480p";
    } else if (h >= 300) { // catches 338 -> 360p
      resolutionLabel = "360p";
    } else if (h >= 200) { 
      resolutionLabel = "240p";
    } else if (h > 0) {    // catches 136 -> 144p
      resolutionLabel = "144p";
    } else {
      resolutionLabel = format.resolution || "Unknown";
    }

    let fps = null;
    if (format.fps && format.fps >= 24) fps = Math.round(format.fps);

    const getBadgeStyle = (b) => {
      switch (b) {
        case "HD": return "bg-blue-500/20 text-blue-300 border-blue-500/30";
        case "FHD": return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
        case "2K": return "bg-accent-cyan/20 text-accent-cyan border-accent-cyan/30";
        case "4K": return "bg-accent-magenta/20 text-accent-magenta border-accent-magenta/30";
        case "8K": return "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30";
        default: return "bg-zinc-500/20 text-zinc-300 border-zinc-500/30";
      }
    };

    const getFpsStyle = (f) => {
      if (f >= 120) return "bg-pink-500/20 text-pink-300 border-pink-500/30";
      if (f >= 90) return "bg-purple-500/20 text-purple-300 border-purple-500/30";
      if (f >= 50) return "bg-blue-400/20 text-blue-300 border-blue-400/30";
      return "bg-black/30 text-zinc-400 border-white/5";
    };

    return (
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <span className="font-extrabold text-[15px] sm:text-base leading-tight break-words tracking-tight">{resolutionLabel}</span>
        
        {badge && (
          <span className={`text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md flex-shrink-0 border uppercase tracking-wider ${getBadgeStyle(badge)}`}>
            {badge}
          </span>
        )}
        
        {fps && (
          <span className={`text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md flex-shrink-0 border uppercase tracking-wider ${getFpsStyle(fps)}`}>
            {fps}fps
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2 group">
      <div
        className={`p-3.5 sm:p-4 rounded-[16px] flex items-center justify-between gap-4 transition-all duration-300 backdrop-blur-md shadow-sm border ${
          hasError 
            ? "border-red-500/50 bg-red-500/10" 
            : `border-white/5 hover:border-white/10 hover:shadow-lg hover:-translate-y-0.5 hover:bg-white/5 ${currentTheme.rowBg}`
        }`}
      >
        {/* Left Section: Info */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 flex-1 min-w-0">
          
          {/* Primary Resolution / Bitrate */}
          <div className="flex items-center min-w-0 w-full sm:w-auto flex-shrink-0 mr-1 sm:mr-2">
            {renderPrimaryLabel()}
          </div>

          {/* Badges & File size container */}
          <div className="flex items-center flex-wrap gap-2 min-w-0">
            <span
              className={`text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider border border-white/10 flex-shrink-0 bg-black/40 text-zinc-300`}
            >
              {format.ext || "UNK"}
            </span>

            {isAudio && format.codec && (
              <span
                className={`text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider border flex-shrink-0 border-white/10 bg-black/40 text-accent-cyan`}
              >
                {formatAudioCodec(format)}
              </span>
            )}

            {/* File Size */}
            <span className={`text-[13px] font-medium ml-1 sm:ml-2 flex-shrink-0 text-zinc-500 whitespace-nowrap`}>
              {format.filesize ? `${(format.filesize / (1024 * 1024)).toFixed(2)} MB` : "—"}
            </span>
          </div>
        </div>

        {/* Right Section: Action Button */}
        <div className="flex-shrink-0 ml-2">
          <button
            onClick={() => onDownloadClick(format.format_id, isAudio)}
            disabled={isDownloadingAny}
            className={`font-semibold text-sm py-2 px-5 rounded-xl transition-all active:scale-95 flex-shrink-0 shadow-sm ${
              isDownloadingAny
                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5"
                : "bg-gradient-to-r from-accent-cyan to-accent-magenta text-white hover:opacity-90 hover:shadow-cyan-500/20 shadow-lg"
            }`}
            title={isAudio ? "Download Audio" : "Download Video"}
          >
            Download
          </button>
        </div>
      </div>

      {hasError && (
        <div className={`p-3 rounded-xl text-sm font-medium flex items-center gap-2 border ${
          currentTheme.text === "text-white" ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-red-50 text-red-600 border-red-200"
        }`}>
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"></path></svg>
          <span>{hasError}</span>
        </div>
      )}
    </div>
  );
};

function VideoInfo({
  videoInfo,
  handleDownload,
  activeDownloads,
  currentTheme
}) {
  const [downloadErrors, setDownloadErrors] = useState({});

  if (!videoInfo) return null;

  // Handle single video type
  const {
    title,
    thumbnail,
    uploader,
    views,
    duration,
    video_formats = [],
    audio_formats = [],
    upload_date,
    platform = "youtube",
  } = videoInfo;

  const handleDownloadClick = async (format_id, isAudio) => {
    try {
      // Clear any previous errors for this format
      setDownloadErrors((prev) => ({ ...prev, [format_id]: null }));

      // Start the download
      await handleDownload(format_id, isAudio);
    } catch (error) {
      console.error("Download error:", error);

      // Set error message for this specific format
      setDownloadErrors((prev) => ({
        ...prev,
        [format_id]: error.message || "Download failed. Please try again.",
      }));

      // Clear error after 5 seconds
      setTimeout(() => {
        setDownloadErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[format_id];
          return newErrors;
        });
      }, 5000);
    }
  };

  const renderFormatList = (formats, isAudio = false) => (
    <div className="flex flex-col space-y-3">
      {formats.map((format) => {
        const hasError = downloadErrors[format.format_id];
        const isDownloadingAny = Object.keys(activeDownloads).length > 0;

        return (
          <FormatCard
            key={format.format_id}
            format={format}
            isAudio={isAudio}
            hasError={hasError}
            currentTheme={currentTheme}
            onDownloadClick={handleDownloadClick}
            isDownloadingAny={isDownloadingAny}
          />
        );
      })}
    </div>
  );

  return (
    <div className={`p-6 sm:p-8 rounded-[24px] backdrop-blur-2xl shadow-2xl w-full max-w-5xl mx-auto transition-all duration-500 animate-fade-in-up border ${currentTheme.text === 'text-white' ? 'bg-zinc-950/60 border-white/10' : 'bg-white/80 border-black/5'}`}>
      <div className={`flex flex-col sm:flex-row gap-6 mb-8 ${!thumbnail ? "items-center text-center" : ""}`}>
        {thumbnail ? (
          <div className="w-full sm:w-72 flex-shrink-0 aspect-video rounded-[16px] overflow-hidden border border-white/10 shadow-2xl bg-black/50 group relative">
             <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
             <img src={thumbnail} alt={title || "Video thumbnail"} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          </div>
        ) : null}

        <div className={`flex flex-col min-w-0 flex-1 justify-center ${!thumbnail ? "items-center w-full" : ""}`}>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl sm:text-3xl filter drop-shadow-md">
              {platform === "youtube" && "🎥"}
              {platform === "instagram" && "📸"}
              {platform === "facebook" && "📘"}
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight bg-gradient-to-r from-accent-cyan to-accent-magenta bg-clip-text text-transparent drop-shadow-sm pb-1" title={title}>
              {title}
            </h2>
          </div>
          <p className="mt-1 font-medium text-zinc-300 text-base flex items-center gap-2">
             <svg className="w-4 h-4 text-accent-cyan" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"></path></svg>
             <span className="truncate">{uploader}</span>
          </p>
          <div className={`flex items-center gap-4 text-sm mt-3 flex-wrap font-medium ${!thumbnail ? "justify-center" : ""} text-zinc-500`}>
            <span className="flex items-center gap-1.5 whitespace-nowrap bg-white/5 py-1 px-3 rounded-full border border-white/5">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>
              {formatViews(views)} views
            </span>
            <span className="flex items-center gap-1.5 whitespace-nowrap bg-white/5 py-1 px-3 rounded-full border border-white/5">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/></svg>
              {formatDuration(duration)}
            </span>
            {upload_date && (
              <span className="flex items-center gap-1.5 whitespace-nowrap bg-white/5 py-1 px-3 rounded-full border border-white/5">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/></svg>
                {formatUploadDate(upload_date)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-10">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
            <h3 className="text-xl font-bold tracking-tight">Video Formats</h3>
          </div>
          {video_formats.length > 0 ? (
            renderFormatList(video_formats, false)
          ) : (
            <p className="text-zinc-500 italic p-4 bg-black/20 rounded-xl border border-white/5">
              No video formats found.
            </p>
          )}
        </div>
        <div className="mt-8 lg:mt-0">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-accent-magenta" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
            <h3 className="text-xl font-bold tracking-tight">Audio Formats</h3>
          </div>
          {audio_formats.length > 0 ? (
            renderFormatList(audio_formats, true)
          ) : (
            <p className="text-zinc-500 italic p-4 bg-black/20 rounded-xl border border-white/5">
              No audio formats found.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default VideoInfo;
