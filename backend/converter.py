import os
import time
import threading
import subprocess
from pathlib import Path
from config import DOWNLOADS_DIR, FFMPEG_PATH

def convert_media(input_path, target_format):
    input_file = Path(input_path)
    output_file = DOWNLOADS_DIR / f"{input_file.stem}_converted.{target_format}"

    cmd = [
        FFMPEG_PATH or "ffmpeg",
        "-y",
        "-i", str(input_file)
    ]

    if target_format == "mp3":
        cmd.extend(["-vn", "-acodec", "libmp3lame", "-q:a", "2"])
    else:
        cmd.extend(["-c:v", "copy", "-c:a", "copy"])

    cmd.append(str(output_file))

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        if output_file.exists():
            output_file.unlink()
        raise RuntimeError("FFmpeg conversion failed.")

    return str(output_file)

def cleanup_files_later(files, delay=5):
    def task():
        time.sleep(delay)
        for f in files:
            try:
                if os.path.exists(f):
                    os.remove(f)
            except Exception:
                pass
                
    threading.Thread(target=task, daemon=True).start()
