import re
import os
import sys
import time
import threading
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DOWNLOADS_DIR

# remove weird terminal color codes from yt-dlp output
_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")

def _format_bytes(num):
    if num is None or num == 0:
        return "0 B"
    try:
        num_f = float(num)
        units = ["B", "KB", "MB", "GB", "TB"]
        i = 0
        while num_f >= 1024.0 and i < len(units) - 1:
            num_f /= 1024.0
            i += 1
        return f"{num_f:.1f} {units[i]}"
    except (ValueError, TypeError):
        return "Unknown"

def _print_log(msg, is_progress=False):
    if is_progress:
        sys.stdout.write(f"\r\033[K{msg}")
        sys.stdout.flush()
    else:
        sys.stdout.write(f"\n{msg}\n")
        sys.stdout.flush()

def _strip_ansi(value):
    if value is None:
        return ""
    return _ANSI_RE.sub("", str(value).strip())

def _normalize_youtube_url(url, keep_playlist=False):
    try:
        parsed = urllib.parse.urlparse(url.strip())
        domain = parsed.netloc.lower()
        
        if "youtube.com" not in domain and "youtu.be" not in domain:
            return url
            
        video_id = None
        qs = urllib.parse.parse_qs(parsed.query)
        is_pure_playlist = "v" not in qs and "list" in qs
        
        if is_pure_playlist or (keep_playlist and "list" in qs):
            if "list" in qs:
                _print_log(f"Playlist context detected for URL: {url}")
            return url

        if domain == "youtu.be":
            video_id = parsed.path.lstrip("/")
        elif "youtube.com" in domain:
            if parsed.path.startswith("/shorts/"):
                video_id = parsed.path.split("/")[2]
            elif parsed.path.startswith("/watch") and "v" in qs:
                video_id = qs["v"][0]
            elif parsed.path.startswith("/v/"):
                video_id = parsed.path.split("/")[2]
                
        # Strip accidental playlist tags if a single video was specifically requested
        if video_id:
            if "list" in qs and not keep_playlist:
                _print_log(f"Trimming accidental playlist/radio context from single video: {video_id}")
            return f"https://www.youtube.com/watch?v={video_id}"
            
        return url
    except Exception as e:
        _print_log(f"URL normalization error: {e}")
        return url

def cleanup_old_files():
    current_time = time.time()
    for file_path in DOWNLOADS_DIR.iterdir():
        if file_path.is_file():
            try:
                if current_time - file_path.stat().st_mtime > 3600:
                    file_path.unlink()
            except Exception:
                pass

def start_cleanup_scheduler():
    def cleanup_loop():
        while True:
            try:
                # Runs every 30 minutes to stop server storage explosion
                time.sleep(1800)
                cleanup_old_files()
            except Exception:
                pass

    threading.Thread(target=cleanup_loop, daemon=True).start()
