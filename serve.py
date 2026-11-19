#!/usr/bin/env python3
"""Loopback development server for the public app and local USDA lookup."""
import http.server
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import time
from urllib.parse import parse_qs, urlsplit

from scripts.public_site import ROOT

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
PUBLIC = set(json.loads((ROOT / "scripts/public-assets.json").read_text()))
ROUTES = {"/", "/today", "/workout", "/meals", "/progress", "/settings"}
WORKERS = threading.BoundedSemaphore(4)
lookup_lock = threading.Lock()
lookup_cache = {}
attempts = []


class LocalHandler(http.server.SimpleHTTPRequestHandler):
    def do_HEAD(self):
        self.serve_request(head=True)

    def do_GET(self):
        self.serve_request(head=False)

    def serve_request(self, head):
        port = self.server.server_port
        if self.headers.get("Host") not in {f"localhost:{port}", f"127.0.0.1:{port}"}:
            self.send_error(403)
            return
        url = urlsplit(self.path)
        if url.path == "/api/usda-foods":
            if self.headers.get("Sec-Fetch-Site") == "cross-site":
                self.send_error(403)
                return
            if head:
                self.send_error(405)
                return
            query = parse_qs(url.query).get("q", [""])[0].strip()
            self.lookup(query)
            return
        name = "index.html" if url.path in ROUTES else url.path.removeprefix("/")
        path = ROOT / name
        if name not in PUBLIC or path.resolve() != path or not path.is_file():
            self.send_error(404)
            return
        self.path = "/" + name
        if head:
            super().do_HEAD()
        else:
            super().do_GET()

    def lookup(self, query):
        if not query or len(query) > 100:
            self.reply(400, {"error": "Enter a food name of up to 100 characters."})
            return
        key = query.casefold()
        with lookup_lock:
            now = time.monotonic()
            cached = lookup_cache.get(key)
            attempts[:] = [stamp for stamp in attempts if now - stamp < 60]
            if cached and cached[0] > now:
                status, body = 200, cached[1]
            elif len(attempts) >= 30 or not WORKERS.acquire(blocking=False):
                status, body = 429, {"error": "Too many food searches. Try again shortly."}
            else:
                attempts.append(now)
                status, body = None, None
        if status:
            self.reply(status, body)
            return
        try:
            result = subprocess.run(
                ["node", str(ROOT / "scripts/local-usda.mjs")], input=query,
                capture_output=True, text=True, check=True, timeout=12,
                env={"PATH": os.environ["PATH"], "USDA_FOODDATA_API_KEY": os.environ["USDA_FOODDATA_API_KEY"]},
            )
            response = json.loads(result.stdout)
            status, body = response["statusCode"], json.loads(response["body"])
            if status == 200:
                with lookup_lock:
                    if len(lookup_cache) >= 128:
                        del lookup_cache[next(iter(lookup_cache))]
                    lookup_cache[key] = (time.monotonic() + 3600, body)
        except (subprocess.SubprocessError, ValueError, OSError, KeyError):
            status, body = 502, {"error": "Local USDA food search is unavailable."}
        finally:
            WORKERS.release()
        self.reply(status, body)

    def reply(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        super().end_headers()


if __name__ == "__main__":
    if not os.environ.get("USDA_FOODDATA_API_KEY", "").strip():
        sys.exit("Set USDA_FOODDATA_API_KEY before starting Tempo. See README.md.")
    if sys.version_info < (3, 14, 10) or (3, 15) <= sys.version_info < (3, 15, 2):
        sys.exit("Use patched Python 3.14.10+ (python3.14 serve.py).")
    if not shutil.which("node"):
        sys.exit("Install a supported Node.js LTS version. See README.md.")
    runtime = subprocess.run(["node", str(ROOT / "scripts/check-runtime.mjs")])
    if runtime.returncode:
        sys.exit(runtime.returncode)
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), LocalHandler) as server:
        print(f"Serving http://localhost:{server.server_port}", flush=True)
        os.chdir(ROOT)
        server.serve_forever()
