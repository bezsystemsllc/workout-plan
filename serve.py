#!/usr/bin/env python3
"""Dev server: static files with aggressive no-cache headers."""
import http.server
import socketserver
import sys
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # SPA fallback: a client-side route (no real file, no extension) → index.html
        path = self.path.split("?", 1)[0]
        rel = path.lstrip("/")
        if path != "/" and not os.path.exists(rel) and "." not in os.path.basename(path):
            self.path = "/index.html"
        return super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
    print(f"Serving http://localhost:{PORT}  (no-cache)")
    httpd.serve_forever()
