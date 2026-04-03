# importing required libraries
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
from utils import _format_bytes, _print_log, _normalize_youtube_url, start_cleanup_scheduler
from downloader import extract_info, build_format_selector, run_download_background
from converter import convert_media, cleanup_files_later

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading", logger=False, engineio_logger=False)

@socketio.on("connect")
def on_connect():
    try:
        emit("your_sid", {"sid": request.sid})
        print(f"Client connected: {request.sid}")
    except Exception as e:
        print(f"Error handling connection: {e}")

@socketio.on("disconnect")
def on_disconnect():
    print(f"Client disconnected: {request.sid}")

@socketio.on("cancel_download")
def on_cancel_download(data):
    if not data or not isinstance(data, dict): return
    task_id = data.get("task_id")
    if not task_id: return emit("error", {"message": "Missing task_id"})
    
    with active_tasks_lock:
        if task_id in active_tasks:
            active_tasks[task_id]["cancel"] = True
            print(f"Cancellation requested for task: {task_id}")
            
    emit("download_canceled", {"task_id": task_id, "message": "Cancellation requested."}, broadcast=False)

@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "time": datetime.utcnow().isoformat() + "Z",
        "version": getattr(ytdlp.version, '__version__', 'unknown') if hasattr(ytdlp, 'version') else "unknown"
    })

@app.post("/api/video-info")
def video_info():
    try:
        data = request.get_json(silent=True) or {}
        url = (data.get("url") or "").strip()
        is_playlist_mode = data.get("is_playlist_mode", False)

        if not url: return jsonify({"success": False, "error": "Missing 'url' parameter"}), 400

        url = _normalize_youtube_url(url, keep_playlist=is_playlist_mode)
        _print_log(f"Fetching metadata for URL: {url} (Playlist Mode: {is_playlist_mode})")

        info, _ = extract_info(url=url, download=False, fmt=build_format_selector(), prefer_container=None, restrict_filenames=False)

        if "entries" in info and isinstance(info["entries"], list):
            entries = []
            for e in info["entries"]:
                if e:
                    thumbnail_url = e.get("thumbnail")
                    if not thumbnail_url:
                        thumbnails = e.get("thumbnails")
                        if thumbnails and isinstance(thumbnails, list) and len(thumbnails) > 0:
                            thumbnail_url = thumbnails[-1].get("url")
                    if not thumbnail_url: thumbnail_url = ""

                    entries.append({
                        "id": e.get("id"),
                        "title": e.get("title", "Unknown Title"),
                        "duration": e.get("duration"),
                        "uploader": e.get("uploader"),
                        "thumbnail": thumbnail_url,
                        "view_count": e.get("view_count")
                    })

            return jsonify({
                "type": "playlist", "title": info.get("title", "Unknown Playlist"),
                "uploader": info.get("uploader"), "entry_count": len(entries), "entries": entries,
            })

        formats = info.get("formats") or []
        video_by_height = {}
        ext_priority = {"mp4": 3, "webm": 2, "mkv": 1}

        for f in formats:
            try:
                vcodec = f.get("vcodec")
                if not vcodec or vcodec == "none": continue

                height = f.get("height") or 0
                width = f.get("width") or 0
                ext = (f.get("ext") or "").lower()
                filesize = f.get("filesize") or f.get("filesize_approx") or 0
                tbr = f.get("tbr") or 0
                fps = f.get("fps") or 0

                if height and width: resolution = f"{width}x{height}"
                elif height: resolution = f"{height}p"
                else: resolution = str(f.get("resolution", "unknown"))

                candidate = {
                    "format_id": f.get("format_id"), "ext": ext, "resolution": resolution,
                    "height": height, "width": width, "format_note": f.get("format_note"),
                    "filesize": filesize, "estimated": (f.get("filesize") is None),
                    "fps": fps, "vcodec": vcodec,
                    "_ext_priority": ext_priority.get(ext, 0), "_tbr": tbr, "_filesize": filesize,
                }

                # Fix for vertical videos: 1080x1920 should be grouped as 1080p, not 1920p
                metric_h = min(height, width) if height and width else height
                fps_rounded = round(fps) if fps else 30
                if fps_rounded in (29, 30): fps_rounded = 30
                elif fps_rounded in (48, 50): fps_rounded = 50
                elif fps_rounded in (59, 60): fps_rounded = 60
                elif fps_rounded > 60: fps_rounded = 120
                else: fps_rounded = 30 

                metric_key = f"{metric_h}p_{fps_rounded}fps"
                existing = video_by_height.get(metric_key)
                if not existing or (candidate["_ext_priority"], candidate["_filesize"], candidate["_tbr"]) > (existing["_ext_priority"], existing["_filesize"], existing["_tbr"]):
                    video_by_height[metric_key] = candidate
            except Exception: pass

        video_formats = [{k: v for k, v in item.items() if not k.startswith("_")} for item in video_by_height.values() if item]
        video_formats.sort(key=lambda x: (min(x.get("height", 0) or 0, x.get("width", 0) or 999999) if x.get("height") and x.get("width") else x.get("height", 0), x.get("fps", 0)), reverse=True)

        audio_formats = []
        for f in formats:
            try:
                vcodec = f.get("vcodec")
                acodec = f.get("acodec")
                if acodec and acodec != "none" and (not vcodec or vcodec == "none"):
                    abr = f.get("abr") or f.get("tbr") or 0
                    filesize = f.get("filesize") or f.get("filesize_approx") or 0
                    audio_formats.append({
                        "format_id": f.get("format_id"), "ext": f.get("ext"),
                        "bitrate": f"{int(abr)} kbps" if abr else "audio",
                        "codec": acodec, "filesize": filesize,
                        "estimated": (f.get("filesize") is None),
                        "_abr": float(abr) if abr else 0.0,
                    })
            except Exception: pass

        audio_formats.sort(key=lambda x: x.get("_abr", 0.0), reverse=True)
        for a in audio_formats: a.pop("_abr", None)

        url_lower = url.lower()
        platform = "instagram" if "instagram.com" in url_lower else "facebook" if "facebook.com" in url_lower or "fb.watch" in url_lower else "youtube"

        thumbnail_url = info.get("thumbnail")
        if not thumbnail_url:
            thumbnails = info.get("thumbnails")
            if thumbnails and isinstance(thumbnails, list) and len(thumbnails) > 0: thumbnail_url = thumbnails[-1].get("url")
        if not thumbnail_url: thumbnail_url = ""

        uploader = info.get("uploader") or info.get("channel") or "Unknown Creator"
        raw_title = info.get("title") or ""
        generic_titles = ["video", "reel", "post", "reel by", "unknown title", ""]
        if not raw_title or str(raw_title).lower().strip() in generic_titles or len(str(raw_title).strip()) < 3:
            if platform == "instagram": raw_title = f"Instagram Reel • {uploader}"
            elif platform == "facebook": raw_title = f"Facebook Video • {uploader}"
            else: raw_title = f"Video • {uploader}"

        return jsonify({
            "type": "video", "id": info.get("id"), "platform": platform, "title": raw_title,
            "uploader": uploader, "thumbnail": thumbnail_url, "views": info.get("view_count") or 0,
            "duration": info.get("duration") or 0, "upload_date": info.get("upload_date") or "",
            "description": info.get("description", "")[:500] if info.get("description") else "",
            "video_formats": video_formats, "audio_formats": audio_formats,
        })

    except Exception as exc:
        return jsonify({"success": False, "error": f"Video info error: {str(exc)}"}), 500

@app.post("/api/download")
def download_handler():
    try:
        data = request.get_json(silent=True) or {}
        url = (data.get("url") or "").strip()
        if not url: return jsonify({"success": False, "error": "Missing 'url' parameter"}), 400

        url = _normalize_youtube_url(url, keep_playlist=False)
        task_id = data.get("task_id") or str(uuid.uuid4())
        format_id = data.get("format_id")
        kind = data.get("type", "video")

        threading.Thread(target=run_download_background, args=(socketio, task_id, url, format_id, kind), daemon=True).start()
        return jsonify({"ok": True, "task_id": task_id})
    except Exception as exc:
        return jsonify({"success": False, "error": f"Download handler error: {str(exc)}"}), 500

@app.post("/api/download-playlist")
def download_playlist_handler():
    try:
        data = request.get_json(silent=True) or {}
        url = (data.get("url") or "").strip()
        if not url: return jsonify({"success": False, "error": "Missing 'url' parameter"}), 400

        url = _normalize_youtube_url(url, keep_playlist=True)
        playlist_task_id = data.get("playlist_task_id") or f"pl_{uuid.uuid4()}"
        format_id = data.get("format_id")
        max_videos = data.get("max_videos")

        def run_playlist():
            try:
                info, _ = extract_info(url=url, download=False, fmt=build_format_selector(), prefer_container=None, restrict_filenames=False)
                entries = info.get("entries") or []
                total = len(entries)
                processed = 0

                for idx, entry in enumerate(entries, start=1):
                    if not entry: continue
                    if max_videos and processed >= int(max_videos): break
                    
                    video_url = (entry.get("url") or entry.get("webpage_url") or entry.get("original_url") or f"https://www.youtube.com/watch?v={entry.get('id')}")
                    if not video_url: continue

                    video_task_id = f"{playlist_task_id}_{idx}"
                    socketio.emit("playlist_progress", {
                        "playlist_task_id": playlist_task_id, "current_video": idx, "total_videos": total,
                        "processed": processed, "video_title": entry.get("title", f"Video {idx}"), "video_task_id": video_task_id,
                    })

                    run_download_background(socketio, task_id=video_task_id, url=video_url, format_id=format_id, kind="video")
                    processed += 1

                socketio.emit("playlist_progress", {"playlist_task_id": playlist_task_id, "status": "completed", "processed": processed, "total_videos": total})
            except Exception as exc:
                socketio.emit("playlist_error", {"playlist_task_id": playlist_task_id, "error": str(exc)})

        threading.Thread(target=run_playlist, daemon=True).start()
        return jsonify({"ok": True, "playlist_task_id": playlist_task_id})
    except Exception as exc:
        return jsonify({"success": False, "error": f"Playlist handler error: {str(exc)}"}), 500

@app.get("/api/files")
def list_files():
    try:
        items = []
        for root, _, files in os.walk(DOWNLOADS_DIR):
            for name in files:
                if name.startswith('.'): continue
                full_path = Path(root) / name
                try:
                    rel_path = str(full_path.relative_to(DOWNLOADS_DIR))
                    stat_info = full_path.stat()
                    items.append({
                        "name": name, "path": rel_path, "size": stat_info.st_size,
                        "size_formatted": _format_bytes(stat_info.st_size),
                        "modified": datetime.fromtimestamp(stat_info.st_mtime).isoformat(),
                    })
                except Exception: continue
        items.sort(key=lambda x: x["modified"], reverse=True)
        return jsonify({"ok": True, "files": items})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500

@app.get("/api/files/<path:filename>")
def serve_file(filename):
    try:
        file_path = DOWNLOADS_DIR / filename
        if not file_path.exists() or not file_path.is_file(): return jsonify({"success": False, "error": "File not found"}), 404
        try: file_path.resolve().relative_to(DOWNLOADS_DIR.resolve())
        except ValueError: return jsonify({"success": False, "error": "Access denied"}), 403
        return send_from_directory(DOWNLOADS_DIR, filename, as_attachment=True)
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500

@app.get("/api/save/<task_id>")
def save_by_task(task_id):
    try:
        with completed_task_files_lock: file_path = completed_task_files.get(task_id)
        if not file_path or not file_path.exists(): return jsonify({"success": False, "error": "File not found"}), 404
        try: rel_path = file_path.relative_to(DOWNLOADS_DIR)
        except ValueError: return jsonify({"success": False, "error": "File access error"}), 500

        with temp_files_lock: temp_files = temp_files_by_task.pop(task_id, [])

        def cleanup_all_files():
            for temp_file in temp_files:
                try: 
                    if temp_file.exists(): temp_file.unlink()
                except Exception: pass
            import time
            time.sleep(2)
            try:
                if file_path.exists(): file_path.unlink()
            except Exception: pass
            with completed_task_files_lock: completed_task_files.pop(task_id, None)

        threading.Thread(target=cleanup_all_files, daemon=True).start()
        return send_from_directory(DOWNLOADS_DIR, str(rel_path), as_attachment=True)
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500

@app.route("/api/convert", methods=["POST"])
def convert_handler():
    try:
        print("--- DEBUG INFO ---")
        print("FILES:", request.files)
        print("FORM:", request.form)

        if "file" not in request.files:
            return jsonify({"success": False, "error": "No file uploaded"}), 400
            
        file = request.files["file"]
        
        target_format = request.form.get("format")
        if not target_format:
            return jsonify({"success": False, "error": "Missing format"}), 400
            
        target_format = target_format.lower()
        
        if not file.filename or file.filename == "":
            return jsonify({"success": False, "error": "Invalid file"}), 400

        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)
        
        if file_size > 100 * 1024 * 1024:
            return jsonify({"success": False, "error": "File too large"}), 400

        if target_format not in ["mp3", "mp4", "mkv"]:
            return jsonify({"success": False, "error": "Unsupported format"}), 400
            
        safe_name = secure_filename(file.filename)
        input_filename = f"{uuid.uuid4().hex}_{safe_name}"
        input_path = DOWNLOADS_DIR / input_filename
        
        file.save(str(input_path))
        
        try:
            output_path = convert_media(input_path, target_format)
            cleanup_files_later([str(input_path), output_path], delay=5)
            
            return send_file(output_path, as_attachment=True)
            
        except Exception as conv_err:
            cleanup_files_later([str(input_path)], delay=0)
            print(f"Conversion Error: {conv_err}")
            return jsonify({"success": False, "error": "Conversion failed"}), 500
            
    except Exception as e:
        print(f"Unexpected Server Error: {e}")
        return jsonify({"success": False, "error": "Server rejected the conversion request"}), 500

@app.errorhandler(404)
def not_found(error): return jsonify({"success": False, "error": "Endpoint not found"}), 404

@app.errorhandler(500)
def internal_error(error): return jsonify({"success": False, "error": "Internal server error"}), 500

# Initialize cleanup scheduler safely to prevent duplicate executions
# WERKZEUG_RUN_MAIN triggers safely in the dev worker process. 
# We explicitly evaluate the DEBUG env var early rather than relying on delayed app.debug evaluation.
is_dev = os.environ.get("DEBUG", "false").lower() == "true"
if os.environ.get("WERKZEUG_RUN_MAIN") == "true" or not is_dev:
    start_cleanup_scheduler()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    host = os.environ.get("HOST", "0.0.0.0")
    debug = os.environ.get("DEBUG", "false").lower() == "true"
    
    if FFMPEG_PATH and FFPROBE_PATH:
        print(f"FFmpeg tracking: Available")
    
    socketio.run(app, host=host, port=port, debug=debug)
