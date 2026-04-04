import re
import os
import sys
import time
import threading
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DOWNLOADS_DIR

# Regex to strip terminal color codes that yt-dlp sometimes adds to output
_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


def format_bytes(num):
    """Convert a byte count into a human-readable string like '4.2 MB'."""
    if num is None or num == 0:
        return "0 B"
    try:
        size = float(num)
        units = ["B", "KB", "MB", "GB", "TB"]
        unit_index = 0
        while size >= 1024.0 and unit_index < len(units) - 1:
            size /= 1024.0
            unit_index += 1
        return f"{size:.1f} {units[unit_index]}"
    except (ValueError, TypeError):
        return "Unknown"


def print_log(msg, is_progress=False):
    """Print a log message. Progress lines overwrite the current line."""
    if is_progress:
        sys.stdout.write(f"\r\033[K{msg}")
        sys.stdout.flush()
    else:
        sys.stdout.write(f"\n{msg}\n")
        sys.stdout.flush()


def strip_ansi(value):
    """Remove ANSI escape codes from a string (yt-dlp sometimes includes them)."""
    if value is None:
        return ""
    return _ANSI_RE.sub("", str(value).strip())


def normalize_youtube_url(url, keep_playlist=False):
    """
    Clean up a YouTube URL to a standard format.
    - Strips playlist context from single-video URLs (unless keep_playlist is True)
    - Handles youtu.be, /shorts/, /watch?v=, /v/ formats
    - Passes non-YouTube URLs through unchanged
    """
    try:
        parsed = urllib.parse.urlparse(url.strip())
        domain = parsed.netloc.lower()

        # Not a YouTube URL — return as-is
        if "youtube.com" not in domain and "youtu.be" not in domain:
            return url

        query_params = urllib.parse.parse_qs(parsed.query)
        is_pure_playlist = "v" not in query_params and "list" in query_params

        # If it's a playlist URL and we want to keep it, don't touch it
        if is_pure_playlist or (keep_playlist and "list" in query_params):
            if "list" in query_params:
                print_log(f"Playlist context detected for URL: {url}")
            return url

        # Extract the video ID from various YouTube URL formats
        video_id = None

        if domain == "youtu.be":
            video_id = parsed.path.lstrip("/")
        elif "youtube.com" in domain:
            if parsed.path.startswith("/shorts/"):
                video_id = parsed.path.split("/")[2]
            elif parsed.path.startswith("/watch") and "v" in query_params:
                video_id = query_params["v"][0]
            elif parsed.path.startswith("/v/"):
                video_id = parsed.path.split("/")[2]

        # Build a clean URL with just the video ID
        if video_id:
            if "list" in query_params and not keep_playlist:
                print_log(f"Trimming accidental playlist/radio context from single video: {video_id}")
            return f"https://www.youtube.com/watch?v={video_id}"

        return url
    except Exception as e:
        print_log(f"URL normalization error: {e}")
        return url


def cleanup_old_files():
    """Delete downloaded files older than 1 hour to prevent storage buildup."""
    current_time = time.time()
    for file_path in DOWNLOADS_DIR.iterdir():
        if file_path.is_file():
            try:
                age_seconds = current_time - file_path.stat().st_mtime
                if age_seconds > 3600:
                    file_path.unlink()
            except Exception:
                pass


def start_cleanup_scheduler():
    """Run cleanup_old_files every 30 minutes in a background thread."""
    def cleanup_loop():
        while True:
            try:
                time.sleep(1800)
                cleanup_old_files()
            except Exception:
                pass

    threading.Thread(target=cleanup_loop, daemon=True).start()
