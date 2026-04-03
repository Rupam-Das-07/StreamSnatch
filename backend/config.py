import threading
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DOWNLOADS_DIR = BASE_DIR / "downloads"
COOKIES_FILE = BASE_DIR / "cookies.txt"
TEMP_DIR = BASE_DIR / "temp_downloads"

DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR.mkdir(parents=True, exist_ok=True)

try:
    from shutil import which
    FFMPEG_PATH = which("ffmpeg") or which("ffmpeg.exe")
    FFPROBE_PATH = which("ffprobe") or which("ffprobe.exe")
    FFMPEG_DIR = str(Path(FFMPEG_PATH).parent) if FFMPEG_PATH else None
except Exception:
    FFMPEG_PATH = None
    FFPROBE_PATH = None
    FFMPEG_DIR = None

active_tasks_lock = threading.Lock()
active_tasks = {}

completed_task_files_lock = threading.Lock()
completed_task_files = {}

temp_files_lock = threading.Lock()
temp_files_by_task = {}

file_creation_times = {}
file_creation_lock = threading.Lock()
