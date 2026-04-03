import os
import sys
import traceback
import threading
import subprocess
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

from utils import _print_log, _strip_ansi, _format_bytes

def build_format_selector(prefer_container=None):
    if prefer_container:
        return f"best[ext={prefer_container}]/bestvideo[ext={prefer_container}]+bestaudio[ext={prefer_container}]/best"
    return "best[height<=1080]/bestvideo[height<=1080]+bestaudio/best"

def build_postprocessors(prefer_container):
    postprocessors = []
    if prefer_container:
        postprocessors.append({"key": "FFmpegVideoConvertor", "preferedformat": prefer_container})
    postprocessors.append({"key": "FFmpegMetadata", "add_metadata": True})
    return postprocessors

import re

def normalize_title(title):
    if not title:
        return "Unknown Title"
        
    # Replace newlines and tabs with space
    title = re.sub(r'[\r\n\t]+', ' ', str(title))
    
    # Remove characters that are not alphanumeric, whitespace, or basic punctuation
    # \w includes unicode characters (so foreign languages still work)
    title = re.sub(r'[^\w\s.,!?:;()\[\]{}"\'-|&]', '', title)
    
    # Replace multiple spaces with a single space and strip
    title = re.sub(r'\s+', ' ', title).strip()
    
    # Truncate if longer than 70 characters
    if len(title) > 70:
        title = title[:67].rstrip() + "..."
        
    return title

def common_ydl_opts(prefer_container, restrict_filenames, include_postprocessors):
    ydl_opts = {
        # Secure Output Template
        "outtmpl": {"default": str(DOWNLOADS_DIR / "%(title)s.%(ext)s")},
        "paths": {"home": str(DOWNLOADS_DIR), "temp": str(TEMP_DIR)},
        "logger": None, "nopart": False, "noprogress": True,
        
        # Stability Options
        "quiet": False,
        "nocheckcertificate": True,
        "geo_bypass": True,
        
        # Browser-like Headers to reduce bot detection
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        },
        
        "no_warnings": True, "concurrent_fragment_downloads": 4, "retries": 10,
        "fragment_retries": 10, "skip_unavailable_fragments": True, "continuedl": True,
        
        # Conditionally load cookies only if the file actively exists
        "cookiefile": str(COOKIES_FILE) if COOKIES_FILE.exists() else None,
        
        "restrictfilenames": restrict_filenames, "writesubtitles": False,
        "writeautomaticsub": False, "ignoreerrors": False, "extract_flat": False,
    }
    if FFMPEG_DIR:
        ydl_opts["ffmpeg_location"] = FFMPEG_DIR

    if include_postprocessors and prefer_container:
        ydl_opts.update({
            "merge_output_format": prefer_container,
            "postprocessors": build_postprocessors(prefer_container),
        })
    return {k: v for k, v in ydl_opts.items() if v is not None}

def extract_info(url, download, fmt, prefer_container, restrict_filenames):
    files = []
    opts = common_ydl_opts(prefer_container, restrict_filenames, include_postprocessors=download)
    opts.update({"format": fmt})

    def hook(d):
        if d.get("status") == "finished":
            filename = d.get("filename")
            if filename:
                file_path = Path(filename)
                if file_path.exists():
                    files.append(file_path)

    if download:
        opts["progress_hooks"] = [hook]

    try:
        if download:
            _print_log("-> Starting initial yt-dlp metadata extraction phase with download flag TRUE...")
        else:
            _print_log("-> Starting initial yt-dlp metadata extraction phase...")

        with ytdlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=download)
            
            # Normalize title for UI safety
            if info:
                if 'title' in info:
                    info['title'] = normalize_title(info['title'])
                if 'entries' in info:
                    for entry in info['entries']:
                        if entry and 'title' in entry:
                            entry['title'] = normalize_title(entry['title'])

        _print_log("<- yt-dlp metadata extraction phase completed securely.")                            
        return info, files
    except Exception as e:
        print(f"yt-dlp extraction failed for URL {url}: {str(e)}")
        raise

def _clean_speed(d):
    speed = d.get("speed")
    if isinstance(speed, (int, float)) and speed > 0:
        return _format_bytes(int(speed)) + "/s"
    raw = _strip_ansi(d.get("_speed_str"))
    if raw and raw.lower() not in ("", "n/a", "unknown", "none"):
        return raw
    return "Calculating..."

def _clean_eta(d):
    eta = d.get("eta")
    if isinstance(eta, (int, float)) and eta > 0:
        eta_int = int(eta)
        hours, remainder = divmod(eta_int, 3600)
        minutes, seconds = divmod(remainder, 60)
        if hours > 0: return f"{hours}h {minutes}m {seconds}s"
        if minutes > 0: return f"{minutes}m {seconds}s"
        return f"{seconds}s"
    raw = _strip_ansi(d.get("_eta_str"))
    if raw and raw.lower() not in ("", "n/a", "unknown", "none"):
        return raw
    return "Calculating..."

def _calc_progress(d):
    total = d.get("total_bytes") or d.get("total_bytes_estimate")
    downloaded = d.get("downloaded_bytes")
    if total and downloaded:
        try:
            return max(0.0, min(100.0, round((float(downloaded) / float(total)) * 100.0, 2)))
        except (ValueError, ZeroDivisionError, TypeError):
            pass
    raw_pct = _strip_ansi(d.get("_percent_str"))
    if raw_pct:
        try:
            return max(0.0, min(100.0, float(raw_pct.rstrip("%"))))
        except (ValueError, AttributeError):
            pass
    return None

def _emit_scaled_progress(socketio, task_id, base_status, phase_progress, start, end, progress_data=None):
    phase_progress = 0.0 if phase_progress is None else max(0.0, min(1.0, phase_progress))
    overall = start + (end - start) * phase_progress

    if progress_data:
        eta_val = _clean_eta(progress_data)
        speed_formatted = _clean_speed(progress_data)
        downloaded_bytes = progress_data.get("downloaded_bytes", 0)
        total_bytes = progress_data.get("total_bytes") or progress_data.get("total_bytes_estimate")
        downloaded_formatted = _format_bytes(downloaded_bytes)
        total_formatted = _format_bytes(total_bytes)
    else:
        eta_val = "Calculating..."
        speed_formatted = "Calculating..."
        downloaded_formatted = "0 B"
        total_formatted = "Calculating..."

    try:
        pct_val = round(overall * 100.0, 2)
        socketio.emit("download_progress", {
            "task_id": task_id,
            "status": base_status,
            "progress": pct_val,
            "eta": eta_val,
            "speed_formatted": speed_formatted,
            "downloaded_formatted": downloaded_formatted,
            "total_formatted": total_formatted,
        })
        if base_status in ("downloading", "processing", "merging"):
            msg = f"Progress: {pct_val:05.1f}% | Speed: {speed_formatted} | ETA: {eta_val}"
            _print_log(msg, is_progress=True)
    except Exception:
        pass

def _run_single_download(url, fmt, include_pp, progress_cb):
    captured = []
    def hook(d):
        fraction = None
        total = d.get("total_bytes") or d.get("total_bytes_estimate")
        done = d.get("downloaded_bytes")
        if total and done:
            try: fraction = float(done) / float(total)
            except Exception: pass
        progress_cb(d, fraction)
        if d.get("status") == "finished" and d.get("filename"):
            p = Path(d["filename"])
            if p.exists():
                captured.append(p)
                
    opts = common_ydl_opts(prefer_container="mp4" if include_pp else None, restrict_filenames=False, include_postprocessors=include_pp)
    opts.update({"format": fmt, "noprogress": True})
    opts["progress_hooks"] = [hook]
    
    try:
        _print_log(f"-> Starting background yt-dlp file download phase for format '{fmt}'...")
        with ytdlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            
        if captured:
            _print_log(f"<- yt-dlp background download phase natively processed file: {captured[-1].name}")
        else:
            _print_log("<- yt-dlp background download phase finished but no file was uniquely captured.")
            
        return info, (captured[-1] if captured else None)
    except Exception as e:
        _print_log(f"Background download failed fatally: {str(e)}")
        raise

def _ffmpeg_merge(video_path, audio_path, out_path):
    cmd = [
        FFMPEG_PATH or "ffmpeg", "-y", "-i", str(video_path), "-i", str(audio_path),
        "-c:v", "copy", "-c:a", "aac", "-strict", "experimental", "-shortest",
        "-avoid_negative_ts", "make_zero", str(out_path)
    ]
    if FFMPEG_PATH is None:
        cmd[0] = "ffmpeg"
    env = os.environ.copy()
    if FFMPEG_DIR:
        env["PATH"] = f"{FFMPEG_DIR}{os.pathsep}" + env.get("PATH", "")

    result = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg failed: {result.stderr}")

def run_download_background(socketio, task_id, url, format_id, kind):
    try:
        with active_tasks_lock:
            active_tasks[task_id] = {"cancel": False, "url": url}

        _print_log(f"Starting download for task {task_id}: {url}")

        def check_cancelled():
            with active_tasks_lock:
                return active_tasks.get(task_id, {}).get("cancel", False)

        if format_id and kind != "audio":
            def vid_cb(d, frac):
                _emit_scaled_progress(socketio, task_id, "downloading", frac or 0.0, 0.0, 0.70, d)
            info_v, video_file = _run_single_download(url, f"{format_id}", include_pp=False, progress_cb=vid_cb)
            if not video_file or not video_file.exists(): raise RuntimeError("Video finished but file missing")

            def aud_cb(d, frac):
                _emit_scaled_progress(socketio, task_id, "downloading", frac or 0.0, 0.70, 0.95, d)
            info_a, audio_file = _run_single_download(url, "bestaudio/best", include_pp=False, progress_cb=aud_cb)
            if not audio_file or not audio_file.exists(): raise RuntimeError("Audio finished but file missing")

            with temp_files_lock:
                temp_files_by_task[task_id] = [video_file, audio_file]

            _emit_scaled_progress(socketio, task_id, "processing", 0.0, 0.95, 1.0)
            
            temp_video_path = DOWNLOADS_DIR / f"{video_file.stem}_temp_video_{task_id}.mp4"
            temp_audio_path = DOWNLOADS_DIR / f"{video_file.stem}_temp_audio_{task_id}.webm"
            final_path = DOWNLOADS_DIR / f"{video_file.stem}.mp4"

            video_file.rename(temp_video_path)
            audio_file.rename(temp_audio_path)

            with temp_files_lock:
                temp_files_by_task[task_id] = [temp_video_path, temp_audio_path]

            try:
                _ffmpeg_merge(temp_video_path, temp_audio_path, final_path)
                _emit_scaled_progress(socketio, task_id, "processing", 1.0, 0.95, 1.0)
            except Exception as merge_exc:
                for temp_file in [temp_video_path, temp_audio_path]:
                    try: 
                        if temp_file.exists(): temp_file.unlink()
                    except Exception: pass
                raise RuntimeError(f"FFmpeg merge failed: {merge_exc}")

        else:
            def cb(d, frac):
                _emit_scaled_progress(socketio, task_id, "downloading", frac or 0.0, 0.0, 0.95, d)
            info, file_caught = _run_single_download(url, "bestvideo*+bestaudio/best", include_pp=True, progress_cb=cb)
            final_path = file_caught
            if not final_path:
                vid = info.get("id", "")
                cand = list(DOWNLOADS_DIR.glob(f"*{vid}*.mp4"))
                if cand: final_path = cand[-1]

        if final_path and final_path.exists():
            with completed_task_files_lock:
                completed_task_files[task_id] = final_path
            socketio.emit("download_progress", {
                "task_id": task_id, "download_id": task_id,
                "status": "completed", "progress": 100.0,
                "filename": final_path.name, "filesize": _format_bytes(final_path.stat().st_size)
            })
        else:
            socketio.emit("download_progress", {"task_id": task_id, "status": "error", "message": "File not accessible"})
            with temp_files_lock:
                for tf in temp_files_by_task.pop(task_id, []):
                    try: 
                        if tf.exists(): tf.unlink()
                    except Exception: pass

    except Exception as exc:
        socketio.emit("download_progress", {"task_id": task_id, "status": "error", "message": str(exc)})
        with temp_files_lock:
            for tf in temp_files_by_task.pop(task_id, []):
                try: 
                    if tf.exists(): tf.unlink()
                except Exception: pass
    finally:
        with active_tasks_lock:
            active_tasks.pop(task_id, None)
