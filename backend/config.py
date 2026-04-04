import threading
from pathlib import Path

# --- Paths ---
BASE_DIR = Path(__file__).resolve().parent
DOWNLOADS_DIR = BASE_DIR / "downloads"
COOKIES_FILE = BASE_DIR / "cookies.txt"
TEMP_DIR = BASE_DIR / "temp_downloads"

# Create directories if they don't exist yet
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# --- FFmpeg Detection ---
# Try to find ffmpeg/ffprobe on the system PATH
try:
    from shutil import which
    FFMPEG_PATH = which("ffmpeg") or which("ffmpeg.exe")
    FFPROBE_PATH = which("ffprobe") or which("ffprobe.exe")
    FFMPEG_DIR = str(Path(FFMPEG_PATH).parent) if FFMPEG_PATH else None
except Exception:
    FFMPEG_PATH = None
    FFPROBE_PATH = None
    FFMPEG_DIR = None

# --- Shared State (Thread-Safe) ---
# Each dict below is shared across threads, so every access needs its matching lock

# Tracks currently running download tasks (used for cancellation)
active_tasks_lock = threading.Lock()
active_tasks = {}

# Maps task_id -> final file path (so the /save endpoint can find it)
completed_task_files_lock = threading.Lock()
completed_task_files = {}

# Maps task_id -> list of temp files to clean up after download
temp_files_lock = threading.Lock()
temp_files_by_task = {}

# Tracks when files were created (used by the cleanup scheduler)
file_creation_times = {}
file_creation_lock = threading.Lock()
