import os
import time
import threading
import subprocess
from pathlib import Path
from config import DOWNLOADS_DIR, FFMPEG_PATH


def convert_media(input_path, target_format):
    """Convert a media file to the given format using FFmpeg."""
    input_file = Path(input_path)
    output_file = DOWNLOADS_DIR / f"{input_file.stem}_converted.{target_format}"

    # Build the FFmpeg command
    cmd = [
        FFMPEG_PATH or "ffmpeg",
        "-y",
        "-i", str(input_file)
    ]

    # MP3 needs audio extraction, other formats just copy streams
    if target_format == "mp3":
        cmd.extend(["-vn", "-acodec", "libmp3lame", "-q:a", "2"])
    else:
        cmd.extend(["-c:v", "copy", "-c:a", "copy"])

    cmd.append(str(output_file))

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        # Clean up partial output if conversion failed
        if output_file.exists():
            output_file.unlink()
        raise RuntimeError("FFmpeg conversion failed.")

    return str(output_file)


def cleanup_files_later(file_paths, delay=5):
    """Delete files after a delay (gives time for the response to be sent first)."""
    def delete_after_delay():
        time.sleep(delay)
        for file_path in file_paths:
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
            except Exception:
                pass

    threading.Thread(target=delete_after_delay, daemon=True).start()
