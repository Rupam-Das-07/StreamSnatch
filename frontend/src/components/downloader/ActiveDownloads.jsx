import React from "react";
import ProgressBar from "../ui/ProgressBar";

function ActiveDownloads({
  activeDownloads,
  handleCancel,
  currentTheme,
  onDownloadComplete,
}) {
  const activeDownloadEntries = Object.entries(activeDownloads || {});

  if (activeDownloadEntries.length === 0) return null;

  return (
    <div className="mb-8 w-full animate-fade-in-up">
      <div className={`p-6 sm:p-8 rounded-[24px] backdrop-blur-2xl shadow-2xl border transition-all duration-500 ${currentTheme.text === "text-white" ? "border-white/10 bg-zinc-950/60" : "border-black/5 bg-white/80"}`}>
        <h3 className="text-xl sm:text-2xl font-extrabold mb-6 flex items-center gap-3 tracking-tight">
          <span className="relative flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-cyan opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-accent-cyan shadow-[0_0_10px_rgba(6,182,212,0.8)]"></span>
          </span>
          Active Downloads
        </h3>
        <div className="space-y-4">
          {activeDownloadEntries.map(([downloadId, download]) => (
            <ProgressBar
              key={downloadId}
              progress={{ ...download, download_id: downloadId }}
              onCancel={() => handleCancel(downloadId)}
              currentTheme={currentTheme}
              onDownloadComplete={onDownloadComplete}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default ActiveDownloads;
