import eventlet
eventlet.monkey_patch()

import os
import uuid
import threading
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory, send_file
from werkzeug.utils import secure_filename
from flask_cors import CORS
from flask_socketio import SocketIO, emit

try:
    import yt_dlp as ytdlp
except Exception:
    pass

from config import (
    DOWNLOADS_DIR, FFMPEG_PATH, FFPROBE_PATH,
    active_tasks, active_tasks_lock,
    completed_task_files, completed_task_files_lock,
    temp_files_by_task, temp_files_lock
)
from utils import format_bytes, print_log, normalize_youtube_url, start_cleanup_scheduler
from downloader import extract_info, build_format_selector, run_download_background
from converter import convert_media, cleanup_files_later


# ──────────────────────────────────────────────
# Simple Task Queue
# ──────────────────────────────────────────────

# Limit concurrent downloads to prevent server overload
MAX_ACTIVE_TASKS = 2

# A plain list to hold waiting tasks
task_queue = []

# How many downloads are running right now
active_downloads = 0

# Lock so multiple threads don't mess up the counter/queue at the same time
queue_lock = threading.Lock()


def add_task(socketio, task_id, task_func):
    """Add a download task. Runs immediately if there's room, otherwise waits in queue."""
    global active_downloads

    with queue_lock:
        if active_downloads < MAX_ACTIVE_TASKS:
            # There's room, run it now
            active_downloads += 1
            should_start = True
        else:
            # Queue is full, save it for later
            task_queue.append((socketio, task_id, task_func))
            socketio.emit("download_progress", {"task_id": task_id, "status": "queued"})
            should_start = False

    if should_start:
        socketio.emit("download_progress", {"task_id": task_id, "status": "started", "progress": 0.0})
        threading.Thread(target=run_task, args=(socketio, task_id, task_func), daemon=True).start()


def run_task(socketio, task_id, task_func):
    """Run the actual download, then check if there's a next task waiting."""
    global active_downloads

    try:
        task_func()
    finally:
        # Download finished (or crashed) — free up the slot
        next_task = None
        with queue_lock:
            active_downloads -= 1

            # If something is waiting in the queue, pick it up
            if len(task_queue) > 0:
                next_task = task_queue.pop(0)
                active_downloads += 1

        # Start the next waiting task (outside the lock so we don't block)
        if next_task:
            next_sio, next_id, next_func = next_task
            next_sio.emit("download_progress", {"task_id": next_id, "status": "started", "progress": 0.0})
            threading.Thread(target=run_task, args=(next_sio, next_id, next_func), daemon=True).start()


# ──────────────────────────────────────────────
# Flask App Setup
# ──────────────────────────────────────────────

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading", logger=False, engineio_logger=False)


# ──────────────────────────────────────────────
# WebSocket Events
# ──────────────────────────────────────────────

@socketio.on("connect")
def on_connect():
    try:
        emit("your_sid", {"sid": request.sid})
        print(f"Client connected: {request.sid}")
    except Exception as error:
        print(f"Error handling connection: {error}")


@socketio.on("disconnect")
def on_disconnect():
    print(f"Client disconnected: {request.sid}")


@socketio.on("cancel_download")
def on_cancel_download(data):
    """Handle download cancellation requests from the frontend."""
    if not data or not isinstance(data, dict):
        return
    task_id = data.get("task_id")
    if not task_id:
        return emit("error", {"message": "Missing task_id"})

    with active_tasks_lock:
        if task_id in active_tasks:
            active_tasks[task_id]["cancel"] = True
            print(f"Cancellation requested for task: {task_id}")

    emit("download_canceled", {"task_id": task_id, "message": "Cancellation requested."}, broadcast=False)


# ──────────────────────────────────────────────
# API Routes
# ──────────────────────────────────────────────

@app.get("/api/health")
def health():
    """Basic health check endpoint."""
    return jsonify({
        "status": "ok",
        "time": datetime.utcnow().isoformat() + "Z",
        "version": getattr(ytdlp.version, '__version__', 'unknown') if hasattr(ytdlp, 'version') else "unknown"
    })


@app.post("/api/video-info")
def get_video_info():
    """Fetch metadata (title, formats, thumbnail, etc.) for a given URL."""
    try:
        data = request.get_json(silent=True) or {}
        url = (data.get("url") or "").strip()
        is_playlist_mode = data.get("is_playlist_mode", False)

        if not url:
            return jsonify({"success": False, "error": "Missing 'url' parameter"}), 400

        url = normalize_youtube_url(url, keep_playlist=is_playlist_mode)
        print_log(f"Fetching metadata for: {url} (Playlist: {is_playlist_mode})")

        info, _ = extract_info(
            url=url,
            download=False,
            fmt=build_format_selector(),
            prefer_container=None,
            restrict_filenames=False
        )

        # --- Playlist Response ---
        if "entries" in info and isinstance(info["entries"], list):
            entries = []
            for entry in info["entries"]:
                if not entry:
                    continue

                # Try to get the best thumbnail available
                thumbnail_url = entry.get("thumbnail") or ""
                if not thumbnail_url:
                    thumbnails = entry.get("thumbnails")
                    if thumbnails and isinstance(thumbnails, list) and len(thumbnails) > 0:
                        thumbnail_url = thumbnails[-1].get("url", "")

                entries.append({
                    "id": entry.get("id"),
                    "title": entry.get("title", "Unknown Title"),
                    "duration": entry.get("duration"),
                    "uploader": entry.get("uploader"),
                    "thumbnail": thumbnail_url,
                    "view_count": entry.get("view_count")
                })

            return jsonify({
                "type": "playlist",
                "title": info.get("title", "Unknown Playlist"),
                "uploader": info.get("uploader"),
                "entry_count": len(entries),
                "entries": entries,
            })

        # --- Single Video Response ---

        # Parse video formats — group by resolution and pick the best one per group
        formats = info.get("formats") or []
        best_by_resolution = {}
        ext_priority = {"mp4": 3, "webm": 2, "mkv": 1}

        for fmt in formats:
            try:
                vcodec = fmt.get("vcodec")
                if not vcodec or vcodec == "none":
                    continue

                height = fmt.get("height") or 0
                width = fmt.get("width") or 0
                ext = (fmt.get("ext") or "").lower()
                filesize = fmt.get("filesize") or fmt.get("filesize_approx") or 0
                tbr = fmt.get("tbr") or 0
                fps = fmt.get("fps") or 0

                # Build resolution string
                if height and width:
                    resolution = f"{width}x{height}"
                elif height:
                    resolution = f"{height}p"
                else:
                    resolution = str(fmt.get("resolution", "unknown"))

                candidate = {
                    "format_id": fmt.get("format_id"),
                    "ext": ext,
                    "resolution": resolution,
                    "height": height,
                    "width": width,
                    "format_note": fmt.get("format_note"),
                    "filesize": filesize,
                    "estimated": (fmt.get("filesize") is None),
                    "fps": fps,
                    "vcodec": vcodec,
                    # Internal fields for comparison (removed before sending)
                    "_ext_priority": ext_priority.get(ext, 0),
                    "_tbr": tbr,
                    "_filesize": filesize,
                }

                # For vertical videos (e.g. Shorts): use the shorter side as resolution
                nominal_height = min(height, width) if height and width else height

                # Round FPS to standard values
                fps_rounded = round(fps) if fps else 30
                if fps_rounded in (29, 30):
                    fps_rounded = 30
                elif fps_rounded in (48, 50):
                    fps_rounded = 50
                elif fps_rounded in (59, 60):
                    fps_rounded = 60
                elif fps_rounded > 60:
                    fps_rounded = 120
                else:
                    fps_rounded = 30

                # Group formats by resolution + fps so we only show one per quality tier
                group_key = f"{nominal_height}p_{fps_rounded}fps"
                existing = best_by_resolution.get(group_key)

                # Keep the one with the best format (mp4 > webm > mkv), then by size, then bitrate
                if not existing or (candidate["_ext_priority"], candidate["_filesize"], candidate["_tbr"]) > (existing["_ext_priority"], existing["_filesize"], existing["_tbr"]):
                    best_by_resolution[group_key] = candidate
            except Exception:
                pass

        # Clean up internal fields before sending to frontend
        video_formats = [
            {key: val for key, val in item.items() if not key.startswith("_")}
            for item in best_by_resolution.values() if item
        ]

        # Sort: highest resolution first, then highest fps
        video_formats.sort(
            key=lambda x: (
                min(x.get("height", 0) or 0, x.get("width", 0) or 999999)
                if x.get("height") and x.get("width")
                else x.get("height", 0),
                x.get("fps", 0)
            ),
            reverse=True
        )

        # Parse audio formats — only include audio-only streams
        audio_formats = []
        for fmt in formats:
            try:
                vcodec = fmt.get("vcodec")
                acodec = fmt.get("acodec")

                # Skip if it has video or no audio
                if not acodec or acodec == "none":
                    continue
                if vcodec and vcodec != "none":
                    continue

                abr = fmt.get("abr") or fmt.get("tbr") or 0
                filesize = fmt.get("filesize") or fmt.get("filesize_approx") or 0

                audio_formats.append({
                    "format_id": fmt.get("format_id"),
                    "ext": fmt.get("ext"),
                    "bitrate": f"{int(abr)} kbps" if abr else "audio",
                    "codec": acodec,
                    "filesize": filesize,
                    "estimated": (fmt.get("filesize") is None),
                    "_abr": float(abr) if abr else 0.0,
                })
            except Exception:
                pass

        # Sort by bitrate (highest first) and remove internal field
        audio_formats.sort(key=lambda x: x.get("_abr", 0.0), reverse=True)
        for audio in audio_formats:
            audio.pop("_abr", None)

        # Detect which platform the URL is from
        url_lower = url.lower()
        if "instagram.com" in url_lower:
            platform = "instagram"
        elif "facebook.com" in url_lower or "fb.watch" in url_lower:
            platform = "facebook"
        else:
            platform = "youtube"

        # Get the best thumbnail available
        thumbnail_url = info.get("thumbnail") or ""
        if not thumbnail_url:
            thumbnails = info.get("thumbnails")
            if thumbnails and isinstance(thumbnails, list) and len(thumbnails) > 0:
                thumbnail_url = thumbnails[-1].get("url", "")

        # Get uploader name with fallbacks
        uploader = info.get("uploader") or info.get("channel") or "Unknown Creator"

        # If the title is too generic, build a better one
        raw_title = info.get("title") or ""
        generic_titles = ["video", "reel", "post", "reel by", "unknown title", ""]
        if not raw_title or str(raw_title).lower().strip() in generic_titles or len(str(raw_title).strip()) < 3:
            if platform == "instagram":
                raw_title = f"Instagram Reel • {uploader}"
            elif platform == "facebook":
                raw_title = f"Facebook Video • {uploader}"
            else:
                raw_title = f"Video • {uploader}"

        return jsonify({
            "type": "video",
            "id": info.get("id"),
            "platform": platform,
            "title": raw_title,
            "uploader": uploader,
            "thumbnail": thumbnail_url,
            "views": info.get("view_count") or 0,
            "duration": info.get("duration") or 0,
            "upload_date": info.get("upload_date") or "",
            "description": info.get("description", "")[:500] if info.get("description") else "",
            "video_formats": video_formats,
            "audio_formats": audio_formats,
        })

    except Exception as error:
        return jsonify({"success": False, "error": f"Video info error: {str(error)}"}), 500


@app.post("/api/download")
def start_download():
    """Start a single video download (queued if slots are full)."""
    try:
        data = request.get_json(silent=True) or {}
        url = (data.get("url") or "").strip()
        if not url:
            return jsonify({"success": False, "error": "Missing 'url' parameter"}), 400

        url = normalize_youtube_url(url, keep_playlist=False)
        task_id = data.get("task_id") or str(uuid.uuid4())
        format_id = data.get("format_id")
        kind = data.get("type", "video")

        def run_single():
            run_download_background(socketio, task_id, url, format_id, kind)

        add_task(socketio, task_id, run_single)
        return jsonify({"ok": True, "task_id": task_id})
    except Exception as error:
        return jsonify({"success": False, "error": f"Download handler error: {str(error)}"}), 500


@app.post("/api/download-playlist")
def start_playlist_download():
    """Start downloading an entire playlist (treated as one queued task)."""
    try:
        data = request.get_json(silent=True) or {}
        url = (data.get("url") or "").strip()
        if not url:
            return jsonify({"success": False, "error": "Missing 'url' parameter"}), 400

        url = normalize_youtube_url(url, keep_playlist=True)
        playlist_task_id = data.get("playlist_task_id") or f"pl_{uuid.uuid4()}"
        format_id = data.get("format_id")
        max_videos = data.get("max_videos")

        def run_playlist():
            try:
                info, _ = extract_info(
                    url=url,
                    download=False,
                    fmt=build_format_selector(),
                    prefer_container=None,
                    restrict_filenames=False
                )
                entries = info.get("entries") or []
                total = len(entries)
                processed = 0

                for idx, entry in enumerate(entries, start=1):
                    if not entry:
                        continue
                    if max_videos and processed >= int(max_videos):
                        break

                    # Try multiple URL fields — yt-dlp isn't consistent about which one it uses
                    video_url = (
                        entry.get("url")
                        or entry.get("webpage_url")
                        or entry.get("original_url")
                        or f"https://www.youtube.com/watch?v={entry.get('id')}"
                    )
                    if not video_url:
                        continue

                    video_task_id = f"{playlist_task_id}_{idx}"
                    socketio.emit("playlist_progress", {
                        "playlist_task_id": playlist_task_id,
                        "current_video": idx,
                        "total_videos": total,
                        "processed": processed,
                        "video_title": entry.get("title", f"Video {idx}"),
                        "video_task_id": video_task_id,
                    })

                    # Download each video sequentially (playlist = one task slot)
                    run_download_background(socketio, task_id=video_task_id, url=video_url, format_id=format_id, kind="video")
                    processed += 1

                socketio.emit("playlist_progress", {
                    "playlist_task_id": playlist_task_id,
                    "status": "completed",
                    "processed": processed,
                    "total_videos": total
                })
            except Exception as error:
                socketio.emit("playlist_error", {
                    "playlist_task_id": playlist_task_id,
                    "error": str(error)
                })

        add_task(socketio, playlist_task_id, run_playlist)
        return jsonify({"ok": True, "playlist_task_id": playlist_task_id})
    except Exception as error:
        return jsonify({"success": False, "error": f"Playlist handler error: {str(error)}"}), 500


# ──────────────────────────────────────────────
# File Management Routes
# ──────────────────────────────────────────────

@app.get("/api/files")
def list_files():
    """List all downloaded files with metadata."""
    try:
        items = []
        for root, _, files in os.walk(DOWNLOADS_DIR):
            for name in files:
                if name.startswith('.'):
                    continue
                full_path = Path(root) / name
                try:
                    rel_path = str(full_path.relative_to(DOWNLOADS_DIR))
                    stat = full_path.stat()
                    items.append({
                        "name": name,
                        "path": rel_path,
                        "size": stat.st_size,
                        "size_formatted": format_bytes(stat.st_size),
                        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    })
                except Exception:
                    continue

        # Most recent files first
        items.sort(key=lambda x: x["modified"], reverse=True)
        return jsonify({"ok": True, "files": items})
    except Exception as error:
        return jsonify({"success": False, "error": str(error)}), 500


@app.get("/api/files/<path:filename>")
def serve_file(filename):
    """Serve a downloaded file for the user to save."""
    try:
        file_path = DOWNLOADS_DIR / filename
        if not file_path.exists() or not file_path.is_file():
            return jsonify({"success": False, "error": "File not found"}), 404

        # Security: make sure the path doesn't escape the downloads directory
        try:
            file_path.resolve().relative_to(DOWNLOADS_DIR.resolve())
        except ValueError:
            return jsonify({"success": False, "error": "Access denied"}), 403

        return send_from_directory(DOWNLOADS_DIR, filename, as_attachment=True)
    except Exception as error:
        return jsonify({"success": False, "error": str(error)}), 500


@app.get("/api/save/<task_id>")
def save_by_task(task_id):
    """Serve the file for a completed download task, then clean up."""
    try:
        with completed_task_files_lock:
            file_path = completed_task_files.get(task_id)

        if not file_path or not file_path.exists():
            return jsonify({"success": False, "error": "File not found"}), 404

        try:
            rel_path = file_path.relative_to(DOWNLOADS_DIR)
        except ValueError:
            return jsonify({"success": False, "error": "File access error"}), 500

        # Grab temp files to clean up
        with temp_files_lock:
            temp_files = temp_files_by_task.pop(task_id, [])

        def cleanup_after_download():
            """Delete temp files immediately, then delete the main file after a short delay."""
            import time

            for temp_file in temp_files:
                try:
                    if temp_file.exists():
                        temp_file.unlink()
                except Exception:
                    pass

            # Wait a bit so the file transfer can complete
            time.sleep(2)

            try:
                if file_path.exists():
                    file_path.unlink()
            except Exception:
                pass

            with completed_task_files_lock:
                completed_task_files.pop(task_id, None)

        threading.Thread(target=cleanup_after_download, daemon=True).start()
        return send_from_directory(DOWNLOADS_DIR, str(rel_path), as_attachment=True)
    except Exception as error:
        return jsonify({"success": False, "error": str(error)}), 500


# ──────────────────────────────────────────────
# File Converter Route
# ──────────────────────────────────────────────

@app.route("/api/convert", methods=["POST"])
def convert_file():
    """Convert an uploaded file to a different format (mp3, mp4, mkv)."""
    try:
        if "file" not in request.files:
            return jsonify({"success": False, "error": "No file uploaded"}), 400

        file = request.files["file"]
        target_format = request.form.get("format")

        if not target_format:
            return jsonify({"success": False, "error": "Missing format"}), 400
        target_format = target_format.lower()

        if not file.filename or file.filename == "":
            return jsonify({"success": False, "error": "Invalid file"}), 400

        # Check file size (max 100MB)
        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)

        if file_size > 100 * 1024 * 1024:
            return jsonify({"success": False, "error": "File too large (max 100MB)"}), 400

        if target_format not in ["mp3", "mp4", "mkv"]:
            return jsonify({"success": False, "error": "Unsupported format"}), 400

        # Save the uploaded file with a unique name to avoid collisions
        safe_name = secure_filename(file.filename)
        input_filename = f"{uuid.uuid4().hex}_{safe_name}"
        input_path = DOWNLOADS_DIR / input_filename

        file.save(str(input_path))

        try:
            output_path = convert_media(input_path, target_format)
            # Clean up both input and output files after the response is sent
            cleanup_files_later([str(input_path), output_path], delay=5)
            return send_file(output_path, as_attachment=True)
        except Exception as conv_error:
            cleanup_files_later([str(input_path)], delay=0)
            print(f"Conversion Error: {conv_error}")
            return jsonify({"success": False, "error": "Conversion failed"}), 500

    except Exception as error:
        print(f"Unexpected Server Error: {error}")
        return jsonify({"success": False, "error": "Server rejected the conversion request"}), 500


# ──────────────────────────────────────────────
# Error Handlers
# ──────────────────────────────────────────────

@app.errorhandler(404)
def not_found(error):
    return jsonify({"success": False, "error": "Endpoint not found"}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({"success": False, "error": "Internal server error"}), 500


# ──────────────────────────────────────────────
# Startup
# ──────────────────────────────────────────────

# Start the cleanup scheduler (deletes old downloads every 30 min)
# In debug mode, Werkzeug spawns two processes — only start in the worker process
is_dev = os.environ.get("DEBUG", "false").lower() == "true"
if os.environ.get("WERKZEUG_RUN_MAIN") == "true" or not is_dev:
    start_cleanup_scheduler()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    host = os.environ.get("HOST", "0.0.0.0")
    debug = os.environ.get("DEBUG", "false").lower() == "true"

    if FFMPEG_PATH and FFPROBE_PATH:
        print("FFmpeg: Available")

    socketio.run(app, host=host, port=port, debug=debug)
