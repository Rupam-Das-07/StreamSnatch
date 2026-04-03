import React, { useState, useEffect } from "react";

function ProgressBar({ progress, onCancel, currentTheme, onDownloadComplete }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  // This function now triggers the final download by opening the /api/save URL
  const handleSave = () => {
    try {
      // Create a temporary anchor element to trigger the download
      const link = document.createElement("a");
      const taskId = progress.task_id || progress.download_id;
      link.href = `http://127.0.0.1:5000/api/save/${taskId}`;
      link.download = progress.filename || ""; // Use filename if available
      link.target = "_blank"; // Open in new tab/window
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Notify parent that this download is complete after saving
      setTimeout(() => {
        if (onDownloadComplete) {
          onDownloadComplete(taskId);
        }
      }, 1000);
    } catch (error) {
      console.error("Error triggering download:", error);
      // Fallback: try to open the URL directly
      window.open(
        `http://127.0.0.1:5000/api/save/${
          progress.task_id || progress.download_id
        }`,
        "_blank"
      );
    }
  };

  const handleCancelClick = () => {
    setShowConfirm(true);
  };

  const confirmCancel = (shouldCancel) => {
    if (shouldCancel) {
      onCancel();
      setShowCancelled(true);
      // Hide the progress bar after 3 seconds and notify parent to remove from active downloads
      setTimeout(() => {
        setIsVisible(false);
        // Notify parent that this download should be removed from active downloads
        if (onDownloadComplete) {
          onDownloadComplete(progress.task_id || progress.download_id);
        }
      }, 3000);
    }
    setShowConfirm(false);
  };

  // Hide progress bar when download is cancelled from backend
  useEffect(() => {
    if (
      progress.status === "cancelled" ||
      progress.status === "canceled" ||
      progress.status === "download_canceled"
    ) {
      setShowCancelled(true);
      setTimeout(() => {
        setIsVisible(false);
        // Notify parent that this download should be removed from active downloads
        if (onDownloadComplete) {
          onDownloadComplete(progress.task_id || progress.download_id);
        }
      }, 3000);
    }
  }, [
    progress.status,
    onDownloadComplete,
    progress.task_id,
    progress.download_id,
  ]);

  // Don't render if not visible
  if (!isVisible) {
    return null;
  }

  // Theme-aware color classes
  const isDarkTheme = currentTheme.text === "text-white";

  // Progress bar colors
  const progressBarBg = isDarkTheme ? "bg-gray-700" : "bg-gray-200";
  const progressBarFill = isDarkTheme ? "bg-accent-cyan" : "bg-blue-600";

  // Status colors
  const statusBlueClass = isDarkTheme ? "text-blue-300" : "text-blue-700";
  const statusGreenClass = isDarkTheme ? "text-green-300" : "text-green-700";
  const statusYellowClass = isDarkTheme ? "text-yellow-300" : "text-yellow-700";
  const statusRedClass = isDarkTheme ? "text-red-400" : "text-red-600";
  const statusGrayClass = isDarkTheme ? "text-gray-400" : "text-gray-600";

  // Button colors
  const cancelButtonClass = isDarkTheme
    ? "text-red-400 hover:text-red-300"
    : "text-red-500 hover:text-red-600";
  const confirmButtonClass = isDarkTheme
    ? "bg-red-600 hover:bg-red-500"
    : "bg-red-600 hover:bg-red-500";
  const denyButtonClass = isDarkTheme
    ? "bg-gray-600 hover:bg-gray-500"
    : "bg-gray-500 hover:bg-gray-400";

  // Format ETA for better display
  const formatETA = (eta) => {
    if (!eta || eta === "N/A" || eta === "Unknown") {
      return "Calculating...";
    }

    // If eta is already formatted (e.g., "2m 30s"), return as is
    if (
      typeof eta === "string" &&
      (eta.includes("m") || eta.includes("s") || eta.includes("h"))
    ) {
      return eta;
    }

    // If eta is a number (seconds), format it
    if (typeof eta === "number" && eta > 0) {
      const hours = Math.floor(eta / 3600);
      const minutes = Math.floor((eta % 3600) / 60);
      const seconds = Math.floor(eta % 60);

      if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
      } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
      } else {
        return `${seconds}s`;
      }
    }

    return eta;
  };

  // Theme-aware panel styling
  const panelBaseClass = `p-5 rounded-[16px] backdrop-blur-md border shadow-sm transition-all duration-300 ${
    isDarkTheme ? "bg-black/40 border-white/5" : "bg-white/60 border-black/5"
  }`;

  // Show cancelled message
  if (showCancelled) {
    return (
      <div className={`${panelBaseClass} flex justify-between items-center animate-pulse`}>
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-zinc-500"></div>
          <span className="font-extrabold text-zinc-400 tracking-tight">
            Current Download Cancelled
          </span>
        </div>
        <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          Disappearing in 3s...
        </div>
      </div>
    );
  }

  // Show a "Save File" button when the backend says it's ready
  if (progress.status === "ready_to_save" || progress.status === "completed") {
    return (
      <div className={`${panelBaseClass} flex justify-between items-center bg-emerald-500/5`}>
        <div className="flex items-center space-x-3">
          <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div>
          <div className="flex flex-col">
            <span className="font-extrabold text-emerald-400 text-lg tracking-tight leading-tight">
              Download Complete!
            </span>
            {progress.filesize && (
              <span className="text-xs font-semibold text-zinc-500 mt-0.5">
                Size: {progress.filesize}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleSave}
          className="bg-gradient-to-r flex-shrink-0 from-emerald-500 to-emerald-400 text-zinc-950 font-extrabold py-2.5 px-6 rounded-xl hover:shadow-[0_0_15px_rgba(16,185,129,0.4)] shadow-lg active:scale-95 transition-all flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          <span>Save Video</span>
        </button>
      </div>
    );
  }

  // Show playlist download status
  if (progress.type === "playlist") {
    return (
      <div className={`${panelBaseClass} flex justify-between items-center`}>
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-accent-cyan animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.6)]"></div>
          <span className="font-extrabold text-accent-cyan tracking-tight">
            Playlist Download Starting...
          </span>
        </div>
        <button
          onClick={handleCancelClick}
          className="bg-red-500/10 text-red-500 border border-red-500/20 font-bold py-2 px-5 rounded-xl hover:bg-red-500/20 transition-all active:scale-95"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Show an error message if the backend reports an error
  if (progress.status === "error") {
    return (
      <div className={`p-5 rounded-[16px] backdrop-blur-md border shadow-sm transition-all duration-300 text-center bg-red-500/10 border-red-500/20`}>
        <div className="flex items-center justify-center space-x-2 mb-2">
          <div className="w-3.5 h-3.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"></div>
          <p className="font-extrabold text-red-500 text-lg tracking-tight">Download Error</p>
        </div>
        <p className="text-sm font-medium text-red-400/90 max-w-lg mx-auto leading-relaxed">
          {progress.message || progress.error || "An unknown error occurred"}
        </p>
        {progress.filename && (
          <p className="text-xs mt-3 text-zinc-500 font-mono bg-black/40 px-3 py-1.5 rounded-lg inline-block break-all max-w-full">
            File: {progress.filename}
          </p>
        )}
      </div>
    );
  }

  // Show processing status (hide merging details)
  if (
    progress.status === "merging" ||
    progress.status === "postprocessing" ||
    progress.status === "processing"
  ) {
    return (
      <div className={`${panelBaseClass} flex justify-between items-center`}>
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-yellow-400 animate-bounce shadow-[0_0_8px_rgba(250,204,21,0.6)]"></div>
          <span className="font-extrabold text-yellow-500 tracking-tight text-lg">
            Processing...
          </span>
        </div>
        <div className="text-sm font-semibold text-zinc-400 animate-pulse">
          Please wait...
        </div>
      </div>
    );
  }

  // Default view: Show the progress bar and cancel button
  const getStatusText = (status) => {
    if (!status) return "Downloading";

    const statusMap = {
      downloading: "Downloading",
      starting: "Starting download...",
      finished: "Processing...",
      completed: "Completed",
      error: "Error",
      cancelled: "Cancelled",
      merging: "Processing...",
      postprocessing: "Processing...",
      processing: "Processing...",
    };

    return (
      statusMap[status] || status.charAt(0).toUpperCase() + status.slice(1)
    );
  };

  const statusText = getStatusText(progress.status);

  return (
    <div className={panelBaseClass}>
      {showConfirm ? (
        <div className="flex flex-col items-center justify-center text-center py-2 animate-fade-in-up">
          <p className="font-extrabold text-lg mb-5 text-white tracking-tight">
            Are you sure you want to cancel this download?
          </p>
          <div className="flex space-x-4">
            <button
              onClick={() => confirmCancel(true)}
              className="bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 font-bold text-sm py-2.5 px-6 rounded-xl transition-all active:scale-95"
            >
              Yes, Cancel
            </button>
            <button
              onClick={() => confirmCancel(false)}
              className="bg-white/10 hover:bg-white/20 text-white font-bold text-sm py-2.5 px-6 rounded-xl transition-all active:scale-95 shadow-sm"
            >
              No, Continue
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Header Row: Status & Speed */}
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-extrabold tracking-wide text-zinc-200">
              {statusText}
            </span>
            {progress.speed_formatted && progress.speed_formatted !== "Calculating..." && (
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 px-2.5 py-1 rounded-md">
                {progress.speed_formatted}
              </span>
            )}
          </div>

          {/* Progress Bar Container */}
          <div className="flex items-center gap-4">
            <div className="flex-1 rounded-full h-2.5 bg-black/40 border border-white/5 overflow-hidden shadow-inner">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent-cyan to-accent-magenta shadow-[0_0_10px_rgba(6,182,212,0.5)] transition-all duration-300 ease-out"
                style={{ width: `${Math.max(0, Math.min(100, progress.progress || 0))}%` }}
              />
            </div>
            <span className="text-sm font-extrabold w-12 text-right text-white tabular-nums">
              {progress.progress ? `${Math.min(100, Math.max(0, progress.progress)).toFixed(1)}%` : "0%"}
            </span>
            <button
              onClick={handleCancelClick}
              title="Cancel Download"
              className="shrink-0 transition-all p-2 rounded-full text-zinc-500 hover:text-red-400 hover:bg-red-500/10 active:scale-90"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Footer Row: Sizes & ETA */}
          <div className="flex justify-between items-center mt-1">
            <span className="text-[11px] font-bold tracking-wide uppercase text-zinc-500">
              {progress.downloaded_formatted || "0 B"} / {progress.total_formatted || "Calculating..."}
            </span>
            <span className="text-[11px] font-extrabold tracking-wide uppercase text-zinc-400">
              ETA: {formatETA(progress.eta)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProgressBar;
