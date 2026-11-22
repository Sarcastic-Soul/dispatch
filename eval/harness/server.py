"""Serve the spike page and record results.

Usage: python3 -I server.py <results.jsonl> [port] [timeout_s] [data_dir]
Serves index.html, dist/*, config.json from this folder and data/*.json from ../data.
POST /result appends one JSON line. GET /done?run=X lists finished item keys for resume.
Exits after a 'final' stage or the timeout.
"""
import json
import pathlib
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HERE = pathlib.Path(__file__).resolve().parent
DATA = pathlib.Path(sys.argv[4]).resolve() if len(sys.argv) > 4 else HERE.parent / "data"
RESULTS = pathlib.Path(sys.argv[1]).resolve()
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8766
TIMEOUT = int(sys.argv[3]) if len(sys.argv) > 3 else 4 * 3600
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json"}


def resolve(path):
    if path in ("/", "/index.html"):
        return HERE / "index.html"
    if path == "/config.json":
        return HERE / "config.json"
    if path.startswith("/dist/") and path.count("/") == 2:
        return HERE / "dist" / path[len("/dist/"):]
    if path.startswith("/data/") and path.count("/") == 2 and path.endswith(".json"):
        return DATA / path[len("/data/"):]
    return None


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/done":
            run = parse_qs(url.query).get("run", [""])[0]
            keys = []
            if RESULTS.exists():
                for line in RESULTS.read_text().splitlines():
                    try:
                        r = json.loads(line)
                    except ValueError:
                        continue
                    if r.get("run") == run and r.get("stage") == "item" and not r.get("err"):
                        keys.append(r["key"])
            return self.send(200, json.dumps(keys).encode(), "application/json")
        f = resolve(url.path)
        if f is None or not f.is_file():
            return self.send(404, b"not found", "text/plain")
        self.send(200, f.read_bytes(), TYPES.get(f.suffix, "application/octet-stream"))

    def do_POST(self):
        data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        with RESULTS.open("a") as out:
            out.write(data.decode() + "\n")
        self.send(204, b"", "text/plain")
        if json.loads(data).get("stage") == "final":
            threading.Thread(target=self.server.shutdown).start()

    def send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
timer = threading.Timer(TIMEOUT, server.shutdown)
timer.daemon = True
timer.start()
print(f"serving on {PORT}", flush=True)
server.serve_forever()
server.server_close()
print("done", flush=True)
