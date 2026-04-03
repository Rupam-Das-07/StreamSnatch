import React, { useState, useEffect, useRef } from "react";
import axios from "axios";

const formatDuration = (seconds) => {
  if (!seconds) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function PlaylistView({
  playlistInfo,
  currentTheme,
  sid,
  activeDownloads,
  setActiveDownloads
}) {
  const [visibleCount, setVisibleCount] = useState(20);
  const [selectedVideos, setSelectedVideos] = useState(new Set());
  const [formatsCache, setFormatsCache] = useState({});
  const [fetchingFormats, setFetchingFormats] = useState({});
  const [expandedRows, setExpandedRows] = useState(new Set());

  // --- TRUE QUEUE STATE ---
  const [pendingQueue, setPendingQueue] = useState([]); // Array of video_ids
  // Maps video_id -> { status: 'queued'|'downloading'|'completed'|'failed', taskId: string|null }
  const [downloadStatusMap, setDownloadStatusMap] = useState({});
  
  const entries = playlistInfo?.entries || [];
  const visibleEntries = entries.slice(0, visibleCount);
  const MAX_CONCURRENT = 3;

  const loadMore = () => setVisibleCount(prev => prev + 20);

  // --- QUEUE ENGINE (Event Driven & Race-Condition Safe) ---
  const isDispatchingRef = useRef(false);

  // 1. Sync React Map strictly with native Socket.IO tracking and detect completions natively
  useEffect(() => {
    setDownloadStatusMap(prev => {
      const nextMap = { ...prev };
      let mapChanged = false;

      for (const [videoId, data] of Object.entries(nextMap)) {
        if (data.status === "downloading" && data.taskId) {
           const activeTracker = activeDownloads[data.taskId];
           if (activeTracker) {
              if (activeTracker.status === "finished") {
                 nextMap[videoId] = { ...data, status: "completed" };
                 mapChanged = true;
              } else if (activeTracker.status === "error" || activeTracker.status === "cancelled") {
                 nextMap[videoId] = { ...data, status: "failed", error: activeTracker.message || "Failed" };
                 mapChanged = true;
              }
           }
        }
      }
      return mapChanged ? nextMap : prev;
    });
  }, [activeDownloads]); // Only sync when Socket pushes updates

  // 2. The Atomic Dispatch Engine
  useEffect(() => {
    // Fire the engine whenever either our pending array grows or active jobs complete/drop.
    processQueue();
  }, [pendingQueue, downloadStatusMap]);

  const processQueue = async () => {
    // Safe atomicity lock: Abort immediately if we're already calculating a dispatch payload.
    if (isDispatchingRef.current) return;
    if (pendingQueue.length === 0) return;

    // Recalculate precisely how many real slots we have open across the entire UI
    let currentActiveCount = 0;
    Object.values(downloadStatusMap).forEach(val => {
       if (val.status === "downloading") currentActiveCount++;
    });

    if (currentActiveCount >= MAX_CONCURRENT) return;

    // Acquire lock
    isDispatchingRef.current = true;

    try {
      const slotsAvailable = MAX_CONCURRENT - currentActiveCount;
      let batchToProcess = [];

      // Extract batch atomically preventing multiple renders from slicing the same ids
      setPendingQueue(prevQueue => {
        if (prevQueue.length === 0) return prevQueue;
        batchToProcess = prevQueue.slice(0, slotsAvailable);
        return prevQueue.slice(slotsAvailable); 
      });

      // If React state queue was empty during execution (caught by functional state), unlock and abort
      if (batchToProcess.length === 0) return;

      // 1. Preemptively block UI state synchronosly for these exact ID copies
      setDownloadStatusMap(prev => {
         const next = { ...prev };
         batchToProcess.forEach(id => {
           next[id] = { ...next[id], status: "downloading" };
         });
         return next;
      });

      // 2. Fire backend requests isolated
      for (const entryId of batchToProcess) {
        const taskId = `${sid}_${entryId}_${Date.now()}`;
        const chosenFormat = formatsCache[entryId]?.selected; 

        // Update Global UI tracker instantly
        setActiveDownloads(prev => ({
          ...prev,
          [taskId]: {
            status: "starting",
            progress: 0,
            eta: "Starting...",
            format_id: chosenFormat || "Default Best",
            task_id: taskId,
            downloaded_formatted: "0 B",
            total_formatted: "Calculating...",
            speed_formatted: "Calculating...",
            title: entries.find(e => e.id === entryId)?.title
          }
        }));

        // Link socket tracker globally back to our row item deeply 
        setDownloadStatusMap(prev => ({
           ...prev,
           [entryId]: { ...prev[entryId], taskId: taskId }
        }));

        try {
          await axios.post("http://127.0.0.1:5000/api/download", {
            url: `https://www.youtube.com/watch?v=${entryId}`,
            format_id: chosenFormat, 
            task_id: taskId,
            type: "video"
          });
        } catch (e) {
          console.error(`Failed dispatch ${entryId}:`, e);
          setActiveDownloads(prev => {
            const next = {...prev};
            if(next[taskId]) {
               next[taskId].status = "error";
               next[taskId].message = "Dispatch connection refused by Flask backend";
            }
            return next;
          });
        }
      }
    } finally {
      // Release lock regardless of failure
      isDispatchingRef.current = false;
      
      // Crucial: After unlocking, if we actually dispatched anything, re-evaluate natively
      // to check if we STILL have open slots because we only looped 1 capacity slice
      if (pendingQueue.length > 0) {
        setTimeout(processQueue, 0);
      }
    }
  };

  const handleDownloadSelected = () => {
    if (selectedVideos.size === 0) return;
    const items = Array.from(selectedVideos);

    // Filter duplicates
    const safeItems = items.filter(id => 
       !downloadStatusMap[id] || downloadStatusMap[id].status === "failed"
    );

    if (safeItems.length === 0) return;

    setDownloadStatusMap(prev => {
      const next = { ...prev };
      safeItems.forEach(id => {
        next[id] = { status: "queued", taskId: null };
      });
      return next;
    });

    setPendingQueue(prev => [...prev, ...safeItems]);
    setSelectedVideos(new Set()); // Clear selection safely
  };

  const retryDownload = (id) => {
    // Treat as a fresh queued item
    setDownloadStatusMap(prev => ({
      ...prev,
      [id]: { status: "queued", taskId: null }
    }));
    setPendingQueue(prev => [...prev, id]);
  };

  // --- INTERACTIONS ---
  const toggleSelect = (id) => {
    // Lock interaction if queued, downloading, or completed
    const state = downloadStatusMap[id]?.status;
    if (state === "queued" || state === "downloading" || state === "completed") {
       return;
    }

    const next = new Set(selectedVideos);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedVideos(next);
  };

  const handleSelectAll = () => {
    const selectable = entries.filter(e => {
       const st = downloadStatusMap[e.id]?.status;
       return st !== "queued" && st !== "downloading" && st !== "completed";
    }).map(e => e.id);

    // If everything selectable is already selected, clear. Otherwise, select everything selectable.
    const allSelected = selectable.every(id => selectedVideos.has(id));
    if (allSelected && selectable.length > 0) {
      setSelectedVideos(new Set());
    } else {
      setSelectedVideos(new Set(selectable));
    }
  };

  const handleClearSelection = () => {
    setSelectedVideos(new Set());
  };

  const toggleRowExpand = async (id) => {
    const next = new Set(expandedRows);
    if (next.has(id)) {
      next.delete(id);
      setExpandedRows(next);
      return;
    }
    next.add(id);
    setExpandedRows(next);

    // Fetch formats silently if not cached
    if (!formatsCache[id] && !fetchingFormats[id]) {
      setFetchingFormats(prev => ({ ...prev, [id]: true }));
      try {
        const response = await axios.post("http://127.0.0.1:5000/api/video-info", {
          url: `https://www.youtube.com/watch?v=${id}`,
          is_playlist_mode: false
        });
        setFormatsCache(prev => ({
          ...prev,
          [id]: {
            formats: response.data.video_formats,
            selected: response.data.video_formats[0]?.format_id || "best"
          }
        }));
      } catch (e) {
        console.error("Failed to fetch format for", id, e);
      } finally {
        setFetchingFormats(prev => ({ ...prev, [id]: false }));
      }
    }
  };

  const handleFormatChange = (id, newFormatId) => {
    setFormatsCache(prev => ({
      ...prev,
      [id]: { ...prev[id], selected: newFormatId }
    }));
  };

  // UI Calculated Helpers
  const activeDownloadingCount = Object.values(downloadStatusMap).filter(v => v.status === "downloading").length;
  const queuedCount = Object.values(downloadStatusMap).filter(v => v.status === "queued").length;
  const isEngineActive = activeDownloadingCount > 0 || queuedCount > 0;

  return (
    <div className={`p-4 sm:p-6 rounded-2xl ${currentTheme.resultsBg} shadow-2xl pb-24`}>
      
      {/* Header and Queue HUD */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-6 pb-6 border-b border-white/10">
        <div>
          <h2 className="text-2xl font-bold mb-1 line-clamp-2">{playlistInfo.title}</h2>
          <p className={`${currentTheme.secondaryText} flex items-center gap-2 text-sm`}>
            <span>{playlistInfo.uploader}</span>
            <span>•</span>
            <span>{playlistInfo.entry_count} Videos</span>
          </p>
        </div>
        {isEngineActive && (
          <div className="px-4 py-2 rounded-xl bg-cyan-900/30 border border-cyan-500/30 text-right animate-pulse">
            <div className="text-xs font-bold text-cyan-400 mb-0.5 uppercase tracking-wide">Queue Active</div>
            <div className="text-sm font-medium">Downloading: <span className="text-white">{activeDownloadingCount}</span></div>
            <div className="text-sm font-medium">Remaining In Queue: <span className="text-white">{queuedCount}</span></div>
          </div>
        )}
      </div>

      {/* Sticky Action Bar */}
      <div className={`sticky top-[80px] z-10 flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl mb-6 shadow-xl backdrop-blur-md border border-white/10 ${currentTheme.rowBg}`}>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleSelectAll}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-gray-500/20 hover:bg-gray-500/30 transition-colors"
          >
            Select All
          </button>
          {selectedVideos.size > 0 && (
            <button 
              onClick={handleClearSelection}
              className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold opacity-80">{selectedVideos.size} Selected</span>
          <button
            onClick={handleDownloadSelected}
            disabled={selectedVideos.size === 0}
            className={`px-5 py-2 text-sm font-bold rounded-lg transition-all shadow-lg ${
              selectedVideos.size === 0
                ? "bg-gray-500/50 text-gray-400 cursor-not-allowed" 
                : "bg-accent-cyan hover:bg-cyan-500 hover:shadow-cyan-500/20 text-white active:scale-95"
            }`}
          >
            Dispatch Selected
          </button>
        </div>
      </div>

      {/* Roster list */}
      <div className="flex flex-col gap-3">
        {visibleEntries.map((entry) => {
          const isSelected = selectedVideos.has(entry.id);
          const isExpanded = expandedRows.has(entry.id);
          const statusObj = downloadStatusMap[entry.id];
          const st = statusObj?.status; // queued, downloading, completed, failed
          
          let rowHighlight = "border-transparent hover:border-white/10";
          if (isSelected) rowHighlight = "border-accent-cyan bg-cyan-900/10";
          if (st === "completed") rowHighlight = "border-green-500/50 bg-green-900/10";
          if (st === "failed") rowHighlight = "border-red-500/50 bg-red-900/10";

          return (
            <div 
              key={entry.id} 
              className={`flex flex-col rounded-xl overflow-hidden transition-all border ${rowHighlight} ${currentTheme.rowBg}`}
            >
              {/* Row Header */}
              <div 
                className={`flex items-center gap-4 p-3 sm:p-4 ${(st === "queued" || st === "downloading" || st === "completed") ? "cursor-default opacity-80" : "cursor-pointer"}`}
                onClick={() => toggleSelect(entry.id)}
              >
                {/* Dynamically Render Checkbox or Status HUD */}
                <div className={`flex-shrink-0 pl-1 flex items-center transition-all ${st ? "w-28 sm:w-32" : "w-8 justify-center"}`}>
                  {!st && (
                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                      isSelected ? "bg-accent-cyan border-accent-cyan" : "border-gray-500 bg-black/20"
                    }`}>
                      {isSelected && <span className="text-white text-xs drop-shadow-md">✓</span>}
                    </div>
                  )}
                  {st === "queued" && (
                    <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-gray-600/20 border border-gray-500/30 text-gray-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-400"></div>
                      <span className="text-xs font-bold uppercase tracking-wide">Queued</span>
                    </div>
                  )}
                  {st === "downloading" && (
                    <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-cyan-900/40 border border-cyan-500/40 text-cyan-300">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin"></div>
                      <span className="text-xs font-bold uppercase tracking-wide animate-pulse">Downloading</span>
                    </div>
                  )}
                  {st === "completed" && (
                    <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-green-900/30 border border-green-500/30 text-green-400">
                      <span className="text-sm font-bold flex-shrink-0">✓</span>
                      <span className="text-xs font-bold uppercase tracking-wide">Completed</span>
                    </div>
                  )}
                  {st === "failed" && (
                    <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-red-900/30 border border-red-500/30 text-red-400">
                      <span className="text-sm font-bold flex-shrink-0">✕</span>
                      <span className="text-xs font-bold uppercase tracking-wide">Failed</span>
                    </div>
                  )}
                </div>

                {/* Thumbnail */}
                <div className="relative w-28 sm:w-36 aspect-video rounded-lg overflow-hidden bg-black/40 flex-shrink-0">
                  {entry.thumbnail ? (
                    <img src={entry.thumbnail} alt="thumb" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs opacity-50">No Thumb</div>
                  )}
                  <div className="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-bold text-white">
                    {formatDuration(entry.duration)}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-center py-1">
                  <h4 className="font-bold text-sm sm:text-base leading-tight mb-1 line-clamp-2">{entry.title}</h4>
                  <p className={`text-xs sm:text-sm ${currentTheme.secondaryText} line-clamp-1`}>{entry.uploader || "Unknown Channel"}</p>
                </div>

                {/* Conditional Dynamic Actions: Format Picker OR Retry Button */}
                <div className="flex-shrink-0 pr-1 flex items-center gap-2">
                  {st === "failed" && (
                     <button
                       onClick={(e) => { e.stopPropagation(); retryDownload(entry.id); }}
                       className="px-3 py-1.5 bg-red-500 hover:bg-red-400 text-white text-xs font-bold rounded-lg shadow-lg active:scale-95 transition-all"
                     >
                       Retry
                     </button>
                  )}
                  {(!st || st === "failed") && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleRowExpand(entry.id); }}
                      className="p-2 rounded-full hover:bg-white/10 text-xs font-bold transition-all"
                      title="Select specific format"
                    >
                      ⚙️
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded Dropdown Area */}
              {isExpanded && (!st || st === "failed") && (
                <div className="px-14 sm:px-20 pb-4 pt-1 flex items-center gap-3 animate-fade-in border-t border-white/5 mt-2 pt-3">
                  {fetchingFormats[entry.id] ? (
                    <div className="text-xs opacity-70 animate-pulse">Loading formats...</div>
                  ) : formatsCache[entry.id]?.formats ? (
                    <div className="flex items-center gap-2">
                       <span className="text-xs opacity-70">Format:</span>
                       <select 
                         onClick={(e) => e.stopPropagation()}
                         value={formatsCache[entry.id].selected}
                         onChange={(e) => handleFormatChange(entry.id, e.target.value)}
                         className={`text-xs px-2 py-1.5 rounded-lg border outline-none cursor-pointer shadow-inner ${
                           currentTheme.text === "text-white" 
                             ? "bg-gray-800 border-gray-700 text-white focus:border-accent-cyan" 
                             : "bg-white border-gray-300 text-black focus:border-accent-cyan"
                         }`}
                       >
                         {formatsCache[entry.id].formats.map(f => (
                           <option key={f.format_id} value={f.format_id}>
                             {f.resolution} {f.fps ? `(${f.fps}fps)` : ''} - {f.ext.toUpperCase()} {f.filesize ? `(${(f.filesize / 1024 / 1024).toFixed(1)}MB)` : ''}
                           </option>
                         ))}
                       </select>
                    </div>
                  ) : (
                    <div className="text-xs opacity-70 text-gray-400">Click ⚙️ to load available formats.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {visibleCount < entries.length && (
        <div className="mt-6 flex justify-center">
          <button 
            onClick={loadMore}
            className="px-6 py-2.5 rounded-xl font-bold bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-sm"
          >
            Load More Videos ({entries.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
