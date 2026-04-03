import React from "react";

function PlaylistProgress({ progress, currentTheme }) {
  const { 
    current_video, 
    total_videos, 
    processed, 
    video_title, 
    status 
  } = progress;

  // Handle completed playlist
  if (status === "completed") {
    return (
      <div className={`p-3 rounded-lg ${currentTheme.rowBg} border border-green-500/30`}>
        <div className="flex justify-between items-center mb-2">
          <span className={`text-sm font-semibold text-green-500`}>
            Playlist Complete: {processed || total_videos} / {total_videos} videos downloaded
          </span>
          <span className={`text-xs text-green-500`}>
            100%
          </span>
        </div>
        <div className={`w-full rounded-full h-2 ${currentTheme.tagBg}`}>
          <div
            className="bg-green-500 h-2 rounded-full transition-all duration-300"
            style={{ width: "100%" }}
          ></div>
        </div>
        <p className={`text-xs mt-2 ${currentTheme.secondaryText}`}>
          All videos downloaded successfully!
        </p>
      </div>
    );
  }

  // Calculate progress percentage
  const progressPercent = total_videos > 0 ? Math.round(((current_video || 0) / total_videos) * 100) : 0;

  return (
    <div className={`p-3 rounded-lg ${currentTheme.rowBg}`}>
      <div className="flex justify-between items-center mb-2">
        <span className={`text-sm font-semibold ${currentTheme.secondaryText}`}>
          Playlist Progress: {current_video || 0} / {total_videos}
          {processed && processed !== current_video && ` (${processed} processed)`}
        </span>
        <span className={`text-xs ${currentTheme.secondaryText}`}>
          {progressPercent}%
        </span>
      </div>
      <div className={`w-full rounded-full h-2 ${currentTheme.tagBg}`}>
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        ></div>
      </div>
      <p className={`text-xs mt-2 ${currentTheme.secondaryText}`}>
        Currently downloading: {video_title || "Preparing..."}
      </p>
    </div>
  );
}

export default PlaylistProgress;

