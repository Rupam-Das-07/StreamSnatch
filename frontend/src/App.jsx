import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import io from "socket.io-client";
import Navbar from "./components/layout/Navbar";
import Searchbar from "./components/downloader/Searchbar";
import VideoInfo from "./components/downloader/VideoInfo";
import Loader from "./components/ui/Loader";
import PlaylistProgress from "./components/downloader/PlaylistProgress";
import ActiveDownloads from "./components/downloader/ActiveDownloads";
import PlaylistView from "./components/downloader/PlaylistView";
import SkeletonCard from "./components/ui/SkeletonCard";
import Converter from "./components/converter/Converter";
import Signup from "./components/auth/Signup";
import Login from "./components/auth/Login";
const socket = io("http://127.0.0.1:5000");

function App() {
  const [activeTab, setActiveTab] = useState("downloader");
  const [url, setUrl] = useState("");
  const [videoInfo, setVideoInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState("dark");
  const [sid, setSid] = useState("");
  const [activeDownloads, setActiveDownloads] = useState({});
  const [playlistProgress, setPlaylistProgress] = useState(null);
  const [showPlaylistPrompt, setShowPlaylistPrompt] = useState(false);
  const [isPlaylistMode, setIsPlaylistMode] = useState(false);
  const fetchControllerRef = useRef(null);
  const SUPPORTED_URL_REGEX =
    /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.watch)\/\S+/i;

  useEffect(() => {
    socket.on("your_sid", (data) => setSid(data.sid));

    socket.on("download_progress", (data) => {
      setActiveDownloads((prev) => {
        // Find the download entry that matches this backend task_id
        const frontendTaskId = Object.keys(prev).find(
          (key) =>
            prev[key].backend_task_id === data.task_id ||
            prev[key].task_id === data.task_id
        );

        if (frontendTaskId) {
          // Update the existing download entry
          return {
            ...prev,
            [frontendTaskId]: {
              ...prev[frontendTaskId],
              ...data,
              format_id: data.format_id || prev[frontendTaskId]?.format_id,
            },
          };
        } else {
          // If no matching frontend task found, log warning but don't create new entry
          console.warn("Received progress for unknown task:", data.task_id);
          return prev;
        }
      });

      // Handle error status by showing error message
      if (data.status === "error" && data.message) {
        setError(data.message);
      }
    });

    socket.on("download_canceled", (data) => {
      setActiveDownloads((prev) => {
        const newDownloads = { ...prev };
        if (data.task_id) {
          // Mark as cancelled but don't remove immediately - let ProgressBar handle the cleanup
          newDownloads[data.task_id] = {
            ...newDownloads[data.task_id],
            status: "cancelled",
            message: data.message || "Download was cancelled.",
          };
        }
        return newDownloads;
      });
    });

    // New playlist events
    socket.on("playlist_progress", (data) => {
      setPlaylistProgress(data);
    });

    socket.on("playlist_error", (data) => {
      setError(`Playlist Error: ${data.error}`);
    });

    return () => {
      socket.off("your_sid");
      socket.off("download_progress");
      socket.off("download_canceled");
      socket.off("playlist_progress");
      socket.off("playlist_error");
    };
  }, []);

  const toggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  };

  const handleFetchDetails = async (forcePlaylist = false) => {
    if (!url) {
      setError("Please paste a URL first.");
      return;
    }
    if (!SUPPORTED_URL_REGEX.test(url)) {
      return;
    }
    
    setShowPlaylistPrompt(false);
    setVideoInfo(null);
    setError("");
    setLoading(true);

    try {
      if (fetchControllerRef.current) {
        try { fetchControllerRef.current.abort(); } catch {}
      }
      const controller = new AbortController();
      fetchControllerRef.current = controller;

      const response = await axios.post(
        "http://127.0.0.1:5000/api/video-info",
        { url, is_playlist_mode: forcePlaylist },
        { signal: controller.signal }
      );
      setVideoInfo(response.data);
      setIsPlaylistMode(forcePlaylist);
      setLoading(false);
    } catch (err) {
      if (axios.isCancel?.(err) || err?.code === "ERR_CANCELED") {
        console.log("Fetch canceled");
        setLoading(false);
        return;
      }
      const message =
        err.response?.data?.error ||
        "An unknown error occurred. Please try again.";
      setError(message);
      setLoading(false);
    }
  };

  const handleCancelFetch = () => {
    if (fetchControllerRef.current) {
      try {
        fetchControllerRef.current.abort();
      } catch {}
    }
  };

  useEffect(() => {
    // Instantly clear the old display when typing or pasting a new URL
    setVideoInfo(null);
    setError("");

    if (!url || !SUPPORTED_URL_REGEX.test(url)) {
      setShowPlaylistPrompt(false);
      return;
    }
    
    // Check for explicit playlist indicators BEFORE automagically fetching 
    if (url.includes("list=") || url.includes("/playlist?")) {
      setShowPlaylistPrompt(true);
      return; // Suspend fetch loop, await user selection.
    }

    const debounceId = setTimeout(() => {
      handleFetchDetails(false);
    }, 700);
    return () => clearTimeout(debounceId);
  }, [url]);

  useEffect(() => {
    return () => {
      if (fetchControllerRef.current) {
        try {
          fetchControllerRef.current.abort();
        } catch {}
      }
    };
  }, []);

  const handleDownload = async (formatId, isAudio = false) => {
    if (!sid) {
      throw new Error("Not connected to server yet. Please wait a moment.");
    }

    const taskId = `${sid}_${formatId}_${Date.now()}`;
    setActiveDownloads((prev) => ({
      ...prev,
      [taskId]: {
        status: "starting",
        progress: 0,
        eta: "Starting...",
        format_id: formatId,
        task_id: taskId,
        downloaded_formatted: "0 B",
        total_formatted: "Calculating...",
        speed_formatted: "Calculating...",
      },
    }));
    setError("");

    try {
      const response = await axios.post("http://127.0.0.1:5000/api/download", {
        url: url,
        format_id: formatId,
        task_id: taskId,
        type: isAudio ? "audio" : "video",
      });

      // Use the backend's task_id if provided, otherwise use our generated one
      const backendTaskId = response.data.task_id || taskId;

      // Update the download status with the backend's task_id
      setActiveDownloads((prev) => ({
        ...prev,
        [taskId]: {
          ...prev[taskId],
          status: "downloading",
          task_id: backendTaskId,
          backend_task_id: backendTaskId, // Store this for progress tracking
        },
      }));

      return response.data;
    } catch (err) {
      const message = err.response?.data?.error || "Failed to start download.";

      // Remove the failed download from active downloads
      setActiveDownloads((prev) => {
        const newDownloads = { ...prev };
        delete newDownloads[taskId];
        return newDownloads;
      });

      // Set error message
      setError(message);

      // Throw error so VideoInfo can handle it
      throw new Error(message);
    }
  };

  const handleCancel = (taskId) => {
    socket.emit("cancel_download", { task_id: taskId });
  };

  const handleDownloadComplete = (taskId) => {
    // Remove the completed/cancelled download from active downloads
    setActiveDownloads((prev) => {
      const newDownloads = { ...prev };
      delete newDownloads[taskId];
      return newDownloads;
    });
  };

  const handlePlaylistDownload = (formatId) => {
    if (!sid) {
      setError("Not connected to server yet. Please wait a moment.");
      return;
    }
    const playlistTaskId = `playlist_${sid}_${Date.now()}`;
    setActiveDownloads((prev) => ({
      ...prev,
      [playlistTaskId]: {
        status: "starting",
        format_id: formatId,
        task_id: playlistTaskId,
        type: "playlist",
      },
    }));
    setError("");

    axios
      .post("http://127.0.0.1:5000/api/download-playlist", {
        url: url,
        format_id: formatId,
        playlist_task_id: playlistTaskId,
        max_videos: 10,
      })
      .catch((err) => {
        const message =
          err.response?.data?.error || "Failed to start playlist download.";
        setError(message);
        setActiveDownloads((prev) => {
          const newDownloads = { ...prev };
          delete newDownloads[playlistTaskId];
          return newDownloads;
        });
      });
  };

  const themeClasses = {
    dark: {
      bg: "bg-gradient-to-b from-dark-grad-start to-dark-grad-end",
      text: "text-white",
      inputBg: "bg-secondary/50 backdrop-blur-sm",
      resultsBg: "bg-secondary/50 backdrop-blur-sm",
      rowBg: "bg-primary/50",
      secondaryText: "text-gray-400",
      tagBg: "bg-gray-600/50",
      tagText: "text-gray-300",
    },
    light: {
      bg: "bg-gradient-to-b from-light-grad-start to-light-grad-end",
      text: "text-black",
      inputBg: "bg-white/50 backdrop-blur-sm",
      resultsBg: "bg-white/60 backdrop-blur-sm shadow-lg",
      rowBg: "bg-gray-200/70",
      secondaryText: "text-gray-600",
      tagBg: "bg-gray-300/50",
      tagText: "text-gray-700",
    },
  };
  const currentTheme = themeClasses[theme];

  return (
    <div
      className={`min-h-screen font-sans ${currentTheme.bg} ${currentTheme.text}`}
    >
      <Navbar theme={theme} toggleTheme={toggleTheme} activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="min-h-screen w-full pt-28 pb-64 px-4 flex flex-col items-center justify-center">
        {activeTab === "downloader" ? (
          <>
            <Searchbar
              url={url}
              setUrl={setUrl}
              handleFetchDetails={() => handleFetchDetails(isPlaylistMode)}
              loading={loading}
              currentTheme={currentTheme}
              theme={theme}
            />

            {/* Dynamic Playlist Prompt */}
            {showPlaylistPrompt && (
              <div className="mt-4 w-full max-w-4xl p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 flex flex-col sm:flex-row items-center justify-between gap-4 animate-fade-in">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📋</span>
                  <div>
                    <h3 className="font-bold text-[15px] mb-0.5">Playlist Context Detected</h3>
                    <p className={`text-sm ${currentTheme.secondaryText}`}>This link contains a playlist. How do you want to proceed?</p>
                  </div>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button 
                    onClick={() => handleFetchDetails(false)}
                    className="flex-1 sm:flex-none px-4 py-2 text-sm font-semibold rounded-lg bg-gray-600/50 hover:bg-gray-500/50 transition-colors"
                  >
                    Single Video
                  </button>
                  <button 
                    onClick={() => handleFetchDetails(true)}
                    className="flex-1 sm:flex-none px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition-colors shadow-lg shadow-indigo-500/20"
                  >
                    View Playlist
                  </button>
                </div>
              </div>
            )}
            <div className="mt-8 w-full max-w-4xl">
              {error && <p className="text-center text-red-400 mb-4">{error}</p>}
              {loading && (isPlaylistMode ? (
                <div className={`mt-8 p-4 sm:p-6 rounded-2xl ${currentTheme.resultsBg} shadow-2xl pb-6 w-full animate-fade-in-up`}>
                  <div className="h-8 w-1/3 bg-white/10 rounded mb-6 relative overflow-hidden">
                    <div className="absolute inset-0 shimmer-bg animate-shimmer"></div>
                  </div>
                  <div className="flex flex-col gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <SkeletonCard key={i} currentTheme={currentTheme} />
                    ))}
                  </div>
                </div>
              ) : (
                <Loader theme={theme} onCancel={handleCancelFetch} />
              ))}
              {playlistProgress && (
                <div className="mb-4">
                  <PlaylistProgress
                    progress={playlistProgress}
                    currentTheme={currentTheme}
                  />
                </div>
              )}

              <ActiveDownloads
                activeDownloads={activeDownloads}
                handleCancel={handleCancel}
                currentTheme={currentTheme}
                onDownloadComplete={handleDownloadComplete}
              />

              {!loading && videoInfo && videoInfo.type === "playlist" && (
                <div className="mt-8 animate-fade-in-up">
                  <PlaylistView
                    playlistInfo={videoInfo}
                    currentTheme={currentTheme}
                    handleCancel={handleCancelFetch}
                    sid={sid}
                    url={url}
                    activeDownloads={activeDownloads}
                    setActiveDownloads={setActiveDownloads}
                  />
                </div>
              )}

              {!loading && videoInfo && videoInfo.type !== "playlist" && (
                <div className="mt-8 animate-fade-in-up">
                  <VideoInfo
                    videoInfo={videoInfo}
                    handleDownload={handleDownload}
                    handlePlaylistDownload={handlePlaylistDownload}
                    activeDownloads={activeDownloads}
                    currentTheme={currentTheme}
                    handleCancel={handleCancel}
                    onDownloadComplete={handleDownloadComplete}
                  />
                </div>
              )}
            </div>
          </>
        ) : activeTab === "converter" ? (
          <div className="mt-4 w-full max-w-4xl animate-fade-in-up">
            <Converter />
          </div>
        ) : activeTab === "signup" ? (
          <div className="mt-4 w-full flex justify-center animate-fade-in-up">
            <Signup setActiveTab={setActiveTab} />
          </div>
        ) : activeTab === "login" ? (
          <div className="mt-4 w-full flex justify-center animate-fade-in-up">
            <Login setActiveTab={setActiveTab} />
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default App;
