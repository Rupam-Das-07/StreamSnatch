import os
import sys
import subprocess
import re
from pathlib import Path

try:
    import yt_dlp as ytdlp
except Exception:
    print("Failed to import yt_dlp. Install it: pip install yt-dlp", file=sys.stderr)
    raise

from config import (
    DOWNLOADS_DIR, TEMP_DIR, COOKIES_FILE,
    FFMPEG_PATH, FFMPEG_DIR,
    active_tasks, active_tasks_lock,
    temp_files_by_task, temp_files_lock,
    completed_task_files, completed_task_files_lock
)

from utils import print_log, strip_ansi, format_bytes


# ──────────────────────────────────────────────
# Title Sanitization
# ──────────────────────────────────────────────

def normalize_title(title):
    """Clean up video titles so they're safe for filenames and UI display."""
    if not title:
        return "Unknown Title"

    # Replace newlines and tabs with spaces
    title = re.sub(r'[\r\n\t]+', ' ', str(title))

    # Remove characters that could break filenames or UI rendering
    # \w keeps unicode letters (so foreign languages still work)
    title = re.sub(r'[^\w\s.,!?:;()\[\]{}"\'\-|&]', '', title)

    # Collapse multiple spaces into one
    title = re.sub(r'\s+', ' ', title).strip()

    # Don't let titles get absurdly long
    if len(title) > 70:
        title = title[:67].rstrip() + "..."

    return title


# ──────────────────────────────────────────────
# yt-dlp Configuration
# ──────────────────────────────────────────────

def build_format_selector(prefer_container=None):
    """Build the format string that tells yt-dlp which quality to download."""
    if prefer_container:
        return f"best[ext={prefer_container}]/bestvideo[ext={prefer_container}]+bestaudio[ext={prefer_container}]/best"
    return "best[height<=1080]/bestvideo[height<=1080]+bestaudio/best"


def build_postprocessors(prefer_container):
    """Build the list of post-processing steps (format conversion, metadata)."""
    postprocessors = []
    if prefer_container:
        postprocessors.append({"key": "FFmpegVideoConvertor", "preferedformat": prefer_container})
    postprocessors.append({"key": "FFmpegMetadata", "add_metadata": True})
    return postprocessors


def build_ydl_options(prefer_container, restrict_filenames, include_postprocessors):
    """Build the full options dict for yt-dlp. This is the central config."""
    options = {
        # Where to save files
        "outtmpl": {"default": str(DOWNLOADS_DIR / "%(title)s.%(ext)s")},
        "paths": {"home": str(DOWNLOADS_DIR), "temp": str(TEMP_DIR)},

        # Quiet mode — we handle our own progress display
        "logger": None,
        "nopart": False,
        "noprogress": True,

        # Stability — bypass common download issues
        "quiet": False,
        "nocheckcertificate": True,
        "geo_bypass": True,

        # Mimic a real browser to reduce bot detection
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        },

        # Retry aggressively — flaky connections are common
        "no_warnings": True,
        "concurrent_fragment_downloads": 4,
        "retries": 10,
        "fragment_retries": 10,
        "skip_unavailable_fragments": True,
        "continuedl": True,

        # Other settings
        "restrictfilenames": restrict_filenames,
        "writesubtitles": False,
        "writeautomaticsub": False,
        "ignoreerrors": False,
        "extract_flat": False,
    }

    if FFMPEG_DIR:
        options["ffmpeg_location"] = FFMPEG_DIR

    if include_postprocessors and prefer_container:
        options["merge_output_format"] = prefer_container
        options["postprocessors"] = build_postprocessors(prefer_container)

    # Use cookies if the file exists (for age-gated or private videos)
    if COOKIES_FILE.exists():
        options["cookiefile"] = str(COOKIES_FILE)
        print_log(f"Cookies loaded: {COOKIES_FILE}")
    else:
        print_log("No cookies.txt found — running without cookies (public videos only)")

    # Remove any None values — yt-dlp doesn't like them
    return {key: value for key, value in options.items() if value is not None}


# ──────────────────────────────────────────────
# Metadata Extraction
# ──────────────────────────────────────────────

def extract_info(url, download, fmt, prefer_container, restrict_filenames):
    """
    Fetch video metadata (and optionally download).
    Returns (info_dict, list_of_downloaded_files).
    """
    downloaded_files = []
    options = build_ydl_options(prefer_container, restrict_filenames, include_postprocessors=download)
    options["format"] = fmt

    # Hook to capture the output file path when download finishes
    def on_download_finished(event):
        if event.get("status") == "finished":
            filename = event.get("filename")
            if filename:
                file_path = Path(filename)
                if file_path.exists():
                    downloaded_files.append(file_path)

    if download:
        options["progress_hooks"] = [on_download_finished]

    try:
        if download:
            print_log("-> Starting yt-dlp download...")
        else:
            print_log("-> Fetching video metadata...")

        with ytdlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=download)

            # Sanitize titles so they're safe for the UI
            if info:
                if "title" in info:
                    info["title"] = normalize_title(info["title"])
                if "entries" in info:
                    for entry in info["entries"]:
                        if entry and "title" in entry:
                            entry["title"] = normalize_title(entry["title"])

        print_log("<- yt-dlp finished successfully.")
        return info, downloaded_files
    except Exception as error:
        print(f"yt-dlp failed for {url}: {error}")
        raise


# ──────────────────────────────────────────────
# Progress Formatting Helpers
# ──────────────────────────────────────────────

def get_clean_speed(progress_data):
    """Extract download speed as a human-readable string."""
    speed = progress_data.get("speed")
    if isinstance(speed, (int, float)) and speed > 0:
        return format_bytes(int(speed)) + "/s"

    raw = strip_ansi(progress_data.get("_speed_str"))
    if raw and raw.lower() not in ("", "n/a", "unknown", "none"):
        return raw

    return "Calculating..."


def get_clean_eta(progress_data):
    """Extract ETA as a human-readable string like '2m 15s'."""
    eta = progress_data.get("eta")
    if isinstance(eta, (int, float)) and eta > 0:
        eta_seconds = int(eta)
        hours, remainder = divmod(eta_seconds, 3600)
        minutes, seconds = divmod(remainder, 60)

        if hours > 0:
            return f"{hours}h {minutes}m {seconds}s"
        if minutes > 0:
            return f"{minutes}m {seconds}s"
        return f"{seconds}s"

    raw = strip_ansi(progress_data.get("_eta_str"))
    if raw and raw.lower() not in ("", "n/a", "unknown", "none"):
        return raw

    return "Calculating..."


def get_download_percent(progress_data):
    """Calculate download progress as a 0-100 float."""
    total = progress_data.get("total_bytes") or progress_data.get("total_bytes_estimate")
    downloaded = progress_data.get("downloaded_bytes")

    if total and downloaded:
        try:
            percent = (float(downloaded) / float(total)) * 100.0
            return max(0.0, min(100.0, round(percent, 2)))
        except (ValueError, ZeroDivisionError, TypeError):
            pass

    # Fallback: parse the percentage string yt-dlp sometimes provides
    raw_pct = strip_ansi(progress_data.get("_percent_str"))
    if raw_pct:
        try:
            return max(0.0, min(100.0, float(raw_pct.rstrip("%"))))
        except (ValueError, AttributeError):
            pass

    return None


# ──────────────────────────────────────────────
# Progress Emission
# ──────────────────────────────────────────────

def emit_progress(socketio, task_id, status, phase_fraction, phase_start, phase_end, progress_data=None):
    """
    Send download progress to the frontend via SocketIO.
    
    phase_fraction: how far through the current phase (0.0 to 1.0)
    phase_start/phase_end: what portion of overall progress this phase represents
    Example: video download = 0.0-0.70, audio download = 0.70-0.95, merge = 0.95-1.0
    """
    # Clamp fraction to valid range
    if phase_fraction is None:
        phase_fraction = 0.0
    phase_fraction = max(0.0, min(1.0, phase_fraction))

    # Map phase progress to overall progress
    overall = phase_start + (phase_end - phase_start) * phase_fraction

    # Build the progress details
    if progress_data:
        eta = get_clean_eta(progress_data)
        speed = get_clean_speed(progress_data)
        downloaded = format_bytes(progress_data.get("downloaded_bytes", 0))
        total = format_bytes(progress_data.get("total_bytes") or progress_data.get("total_bytes_estimate"))
    else:
        eta = "Calculating..."
        speed = "Calculating..."
        downloaded = "0 B"
        total = "Calculating..."

    try:
        percent = round(overall * 100.0, 2)
        socketio.emit("download_progress", {
            "task_id": task_id,
            "status": status,
            "progress": percent,
            "eta": eta,
            "speed_formatted": speed,
            "downloaded_formatted": downloaded,
            "total_formatted": total,
        })

        # Log progress to the server console
        if status in ("downloading", "processing", "merging"):
            print_log(f"Progress: {percent:05.1f}% | Speed: {speed} | ETA: {eta}", is_progress=True)
    except Exception:
        pass


# ──────────────────────────────────────────────
# Single File Download
# ──────────────────────────────────────────────

def download_single_file(url, fmt, include_postprocessors, on_progress):
    """
    Download a single file (video or audio) using yt-dlp.
    on_progress(event, fraction) is called during download.
    Returns (info_dict, downloaded_file_path).
    """
    captured_files = []

    def progress_hook(event):
        # Calculate how far along this download is (0.0 to 1.0)
        fraction = None
        total = event.get("total_bytes") or event.get("total_bytes_estimate")
        done = event.get("downloaded_bytes")
        if total and done:
            try:
                fraction = float(done) / float(total)
            except Exception:
                pass

        on_progress(event, fraction)

        # When a file finishes downloading, save its path
        if event.get("status") == "finished" and event.get("filename"):
            file_path = Path(event["filename"])
            if file_path.exists():
                captured_files.append(file_path)

    container = "mp4" if include_postprocessors else None
    options = build_ydl_options(prefer_container=container, restrict_filenames=False, include_postprocessors=include_postprocessors)
    options["format"] = fmt
    options["noprogress"] = True
    options["progress_hooks"] = [progress_hook]

    try:
        print_log(f"-> Downloading format '{fmt}'...")
        with ytdlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=True)

        if captured_files:
            print_log(f"<- Downloaded: {captured_files[-1].name}")
        else:
            print_log("<- Download finished but no file was captured.")

        return info, (captured_files[-1] if captured_files else None)
    except Exception as error:
        print_log(f"Download failed: {error}")
        raise


# ──────────────────────────────────────────────
# FFmpeg Merge
# ──────────────────────────────────────────────

def merge_video_audio(video_path, audio_path, output_path):
    """Merge separate video and audio files into a single MP4 using FFmpeg."""
    cmd = [
        FFMPEG_PATH or "ffmpeg",
        "-y",
        "-i", str(video_path),
        "-i", str(audio_path),
        "-c:v", "copy",
        "-c:a", "aac",
        "-strict", "experimental",
        "-shortest",
        "-avoid_negative_ts", "make_zero",
        str(output_path)
    ]

    env = os.environ.copy()
    if FFMPEG_DIR:
        env["PATH"] = f"{FFMPEG_DIR}{os.pathsep}" + env.get("PATH", "")

    result = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg merge failed: {result.stderr}")


# ──────────────────────────────────────────────
# Main Download Logic (Background Thread)
# ──────────────────────────────────────────────

def run_download_background(socketio, task_id, url, format_id, kind):
    """
    The main download function that runs in a background thread.
    
    Two paths:
    1. Specific format requested → download video + audio separately, then merge with FFmpeg
    2. No specific format → let yt-dlp pick the best combined format automatically
    """
    try:
        # Register this task so it can be cancelled
        with active_tasks_lock:
            active_tasks[task_id] = {"cancel": False, "url": url}

        print_log(f"Starting download for task {task_id}: {url}")

        if format_id and kind != "audio":
            # --- Path 1: Download video and audio separately, then merge ---

            # Step 1: Download the video stream (0% to 70% of overall progress)
            def on_video_progress(event, fraction):
                emit_progress(socketio, task_id, "downloading", fraction or 0.0, 0.0, 0.70, event)

            video_info, video_file = download_single_file(url, f"{format_id}", include_postprocessors=False, on_progress=on_video_progress)
            if not video_file or not video_file.exists():
                raise RuntimeError("Video download finished but file is missing")

            # Step 2: Download the audio stream (70% to 95% of overall progress)
            def on_audio_progress(event, fraction):
                emit_progress(socketio, task_id, "downloading", fraction or 0.0, 0.70, 0.95, event)

            audio_info, audio_file = download_single_file(url, "bestaudio/best", include_postprocessors=False, on_progress=on_audio_progress)
            if not audio_file or not audio_file.exists():
                raise RuntimeError("Audio download finished but file is missing")

            # Track temp files so they can be cleaned up later
            with temp_files_lock:
                temp_files_by_task[task_id] = [video_file, audio_file]

            # Step 3: Merge video + audio with FFmpeg (95% to 100%)
            emit_progress(socketio, task_id, "processing", 0.0, 0.95, 1.0)

            temp_video = DOWNLOADS_DIR / f"{video_file.stem}_temp_video_{task_id}.mp4"
            temp_audio = DOWNLOADS_DIR / f"{video_file.stem}_temp_audio_{task_id}.webm"
            final_path = DOWNLOADS_DIR / f"{video_file.stem}.mp4"

            video_file.rename(temp_video)
            audio_file.rename(temp_audio)

            with temp_files_lock:
                temp_files_by_task[task_id] = [temp_video, temp_audio]

            try:
                merge_video_audio(temp_video, temp_audio, final_path)
                emit_progress(socketio, task_id, "processing", 1.0, 0.95, 1.0)
            except Exception as merge_error:
                # Clean up temp files if merge fails
                for temp_file in [temp_video, temp_audio]:
                    try:
                        if temp_file.exists():
                            temp_file.unlink()
                    except Exception:
                        pass
                raise RuntimeError(f"FFmpeg merge failed: {merge_error}")

        else:
            # --- Path 2: Let yt-dlp handle everything automatically ---

            def on_progress(event, fraction):
                emit_progress(socketio, task_id, "downloading", fraction or 0.0, 0.0, 0.95, event)

            info, downloaded_file = download_single_file(url, "bestvideo*+bestaudio/best", include_postprocessors=True, on_progress=on_progress)
            final_path = downloaded_file

            # Fallback: if the hook didn't catch the file, try to find it by video ID
            if not final_path:
                video_id = info.get("id", "")
                matches = list(DOWNLOADS_DIR.glob(f"*{video_id}*.mp4"))
                if matches:
                    final_path = matches[-1]

        # --- Send completion status to frontend ---
        if final_path and final_path.exists():
            with completed_task_files_lock:
                completed_task_files[task_id] = final_path

            socketio.emit("download_progress", {
                "task_id": task_id,
                "download_id": task_id,
                "status": "completed",
                "progress": 100.0,
                "filename": final_path.name,
                "filesize": format_bytes(final_path.stat().st_size)
            })
        else:
            socketio.emit("download_progress", {
                "task_id": task_id,
                "status": "error",
                "message": "File not accessible"
            })
            # Clean up any leftover temp files
            with temp_files_lock:
                for temp_file in temp_files_by_task.pop(task_id, []):
                    try:
                        if temp_file.exists():
                            temp_file.unlink()
                    except Exception:
                        pass

    except Exception as error:
        socketio.emit("download_progress", {
            "task_id": task_id,
            "status": "error",
            "message": str(error)
        })
        # Clean up temp files on any error
        with temp_files_lock:
            for temp_file in temp_files_by_task.pop(task_id, []):
                try:
                    if temp_file.exists():
                        temp_file.unlink()
                except Exception:
                    pass
    finally:
        # Always unregister the task when done
        with active_tasks_lock:
            active_tasks.pop(task_id, None)
