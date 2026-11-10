#!/usr/bin/env python3
"""brain_live: the second brain page with the brain-keeper agent's terminal docked beside it.

    python3 .claude/all/brain_live.py [admin-second-brain-<id>] [--port 8765] [--tty-port 7681] [--no-open]

Left: the daily page (<brain>/local/second_brain_report/index.html). When any brain file changes (outside .git and
local/), or the agent asks (POST /__rebuild, which also fetches), the page is rebuilt with --ids (new to-do lines get
their tNNN) and reloads in place, keeping the scroll. Cmd+R, Ctrl+R and F5 refresh only the page, never the terminal;
Shift+Enter in the terminal makes a new line (sent as Meta+Enter), as in a native terminal.
Right: `claude` running in the brain as brain-keeper (its definition, brain-keeper.md next to this script, is
appended to the system prompt). It runs inside tmux, so a tab reload
reattaches to the same conversation; the launcher starts that session detached, so stopping
the launcher or ttyd never ends it.

Brain: the argument, else the one darwin-brain.sh recorded (~/.cache/darwin/second-brain), next to this repo.
Needs ttyd and tmux (Mac: brew install ttyd tmux; Ubuntu: sudo apt install ttyd tmux, then sudo systemctl disable
--now ttyd, as the apt package starts a root ttyd service on 127.0.0.1:7681 that holds the terminal's port). Both listen on 127.0.0.1 only: the terminal has full access to the
machine. Ctrl-C stops the page and the terminal; the tmux session (the conversation) stays until `tmux kill-session
-t brain-live`.
"""
from __future__ import annotations

import argparse
import http.server
import json
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

# How to install the two tools on this machine. On Ubuntu the ttyd package also starts a root ttyd service on
# 127.0.0.1:7681, the terminal's own port, so the live view needs it disabled.
INSTALL = ("brew install ttyd tmux" if sys.platform == "darwin"
           else "sudo apt install ttyd tmux && sudo systemctl disable --now ttyd")

REPO = Path(__file__).resolve().parents[2]          # the repo whose .claude/all holds this script
CACHE = Path(os.environ.get("DARWIN_CACHE") or Path.home() / ".cache" / "darwin")
SESSION = "brain-live"
REBUILD = threading.Event()

SHELL = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Second brain live</title>
<style>
  :root { --bg:#f6f5f2; --bar:#1f2328; --bar-fg:#e6e6e6; --accent:#3fb950; --line:#d0d0d0; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0d1117; --line:#30363d; } }
  * { box-sizing:border-box; }
  html,body { margin:0; height:100%; background:var(--bg); font:13px -apple-system,system-ui,sans-serif; }
  #app { display:grid; grid-template-columns: var(--left, 60%) 6px 1fr; grid-template-rows: 32px 1fr; height:100vh; }
  header { grid-column:1 / -1; display:flex; align-items:center; gap:12px; padding:0 12px; background:var(--bar); color:var(--bar-fg); }
  header b { font-weight:600; }
  .dot { width:8px; height:8px; border-radius:50%; background:var(--accent); display:inline-block; margin-right:6px; }
  .dot.flash { animation:flash 1.2s ease-out; }
  @keyframes flash { 0% { box-shadow:0 0 0 0 rgba(63,185,80,.9); } 100% { box-shadow:0 0 0 10px rgba(63,185,80,0); } }
  header .sp { flex:1; }
  header button { background:transparent; color:var(--bar-fg); border:1px solid #444c56; border-radius:4px; padding:2px 8px; cursor:pointer; font:inherit; }
  iframe { width:100%; height:100%; border:0; display:block; }
  #report { background:#fff; }
  #drag { background:var(--line); cursor:col-resize; }
  #term { background:#000; }
  #app.noterm { grid-template-columns: 1fr 0 0; }
  #app.dragging iframe { pointer-events:none; }
</style></head><body>
<div id="app">
  <header><b>Second brain</b><span><span class="dot" id="dot"></span><span id="status">live</span></span>
    <span class="sp"></span><button id="rebuild" title="Fetch, rebuild and reload the page; the terminal stays">Refresh page</button><button id="toggle">Hide terminal</button></header>
  <iframe id="report" src="/report/index.html"></iframe>
  <div id="drag"></div>
  <iframe id="term" src="http://127.0.0.1:__TTY__/"></iframe>
</div>
<script>
const app = document.getElementById('app'), report = document.getElementById('report');
const dot = document.getElementById('dot'), status = document.getElementById('status');
let last = null;
function reloadReport() {
  let y = 0; try { y = report.contentWindow.scrollY; } catch (e) {}
  report.addEventListener('load', () => { try { report.contentWindow.scrollTo(0, y); } catch (e) {} }, {once: true});
  report.contentWindow.location.reload();
  dot.classList.remove('flash'); void dot.offsetWidth; dot.classList.add('flash');
  status.textContent = 'updated ' + new Date().toLocaleTimeString();
}
async function poll() {
  try {
    const m = (await (await fetch('/__mtime', {cache:'no-store'})).json()).mtime;
    if (last !== null && m !== last) reloadReport();
    last = m;
  } catch (e) { status.textContent = 'server stopped'; }
}
setInterval(poll, 1000); poll();
// Cmd+R, Ctrl+R and F5 refresh only the page, never the terminal (the report frame is same-origin, so its keys
// are caught too; inside the terminal frame the browser decides, and tmux keeps the conversation anyway).
function onKey(ev) {
  if (ev.key === 'F5' || ((ev.metaKey || ev.ctrlKey) && (ev.key === 'r' || ev.key === 'R'))) {
    ev.preventDefault(); reloadReport();
  }
}
addEventListener('keydown', onKey);
report.addEventListener('load', () => { try { report.contentWindow.addEventListener('keydown', onKey); } catch (e) {} });
document.getElementById('rebuild').onclick = () => { status.textContent = 'rebuilding...'; fetch('/__rebuild', {method:'POST'}); };
document.getElementById('toggle').onclick = e => {
  app.classList.toggle('noterm'); e.target.textContent = app.classList.contains('noterm') ? 'Show terminal' : 'Hide terminal';
};
const drag = document.getElementById('drag');
drag.onmousedown = () => { app.classList.add('dragging');
  onmousemove = ev => app.style.setProperty('--left', Math.min(85, Math.max(15, ev.clientX / innerWidth * 100)) + '%');
  onmouseup = () => { app.classList.remove('dragging'); onmousemove = onmouseup = null; };
};
</script></body></html>"""


# In the browser terminal Shift+Enter sends a plain Enter, so claude submits. This makes it send Meta+Enter (ESC CR),
# claude's new line, like Option+Enter in a native terminal. ttyd exposes its xterm.js terminal as window.term.
SHIFT_ENTER = """<script>(function () {
  let hooked = null;
  setInterval(function () {
    const t = window.term;
    if (!t || t === hooked || !t.attachCustomKeyEventHandler) return;
    t.attachCustomKeyEventHandler(function (e) {
      if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.type === 'keydown') t.input('\\x1b\\r');
        return false;
      }
      return true;
    });
    hooked = t;
  }, 300);
})();</script>"""


def tty_index(port: int) -> Path | None:
    """ttyd's own page with SHIFT_ENTER added, written to the cache (served with ttyd -I). Built from the installed
    ttyd each start, so it follows ttyd upgrades. None (plain ttyd) if anything fails."""
    import urllib.request
    probe = subprocess.Popen(["ttyd", "-i", "127.0.0.1", "-p", str(port), "true"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(30):
            try:
                html = urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=1).read().decode("utf-8")
                break
            except OSError:
                time.sleep(0.1)
        else:
            return None
    finally:
        probe.terminate()
        probe.wait()
    if "window.term" not in html or "</body>" not in html:
        return None
    CACHE.mkdir(parents=True, exist_ok=True)
    out = CACHE / "brain_live_ttyd.html"
    out.write_text(html.replace("</body>", SHIFT_ENTER + "</body>", 1), encoding="utf-8")
    return out


def find_brain(arg: str | None) -> Path:
    name = arg or ((CACHE / "second-brain").read_text().strip() if (CACHE / "second-brain").is_file() else "")
    if not name:
        sys.exit("Which second brain? Pass it (brain_live.py admin-second-brain-<id>) or run darwin-brain.sh once.")
    p = Path(name).expanduser()
    return (p if p.is_absolute() or p.exists() else REPO.parent / name).resolve()


def agent_prompt() -> str:
    """brain-keeper's definition body (rolled out next to this script, .claude/all/brain-keeper.md), frontmatter dropped."""
    f = Path(__file__).resolve().parent / "brain-keeper.md"
    if not f.is_file():
        sys.exit(f"brain-keeper's definition is missing: {f} (roll out .claude/all/ again).")
    return f.read_text(encoding="utf-8").split("\n---\n", 1)[-1].strip()


def builder() -> Path | None:
    """The newest cached second_brain_report.py, the same one darwin-brain.sh picks."""
    root = Path(os.environ.get("DARWIN_PLANNING_CACHE") or Path.home() / ".cache" / "darwin-planning")
    found = sorted((d for d in root.glob("*/") if (d / "second_brain_report.py").is_file()),
                   key=lambda d: d.stat().st_mtime, reverse=True) if root.is_dir() else []
    return found[0] / "second_brain_report.py" if found else None


def sources_mtime(brain: Path) -> float:
    m = 0.0
    for p in brain.rglob("*"):
        parts = p.relative_to(brain).parts
        if parts and parts[0] in (".git", "local"):
            continue
        try:
            if p.is_file():
                m = max(m, p.stat().st_mtime)
        except OSError:
            pass
    return m


def rebuild(brain: Path, fetch: bool) -> None:
    b = builder()
    if not b:
        print("No cached page builder: ask the agent to call kb_planning_builders() once.", flush=True)
        return
    r = subprocess.run([sys.executable, str(b), str(brain), "--person", brain.name.removeprefix("admin-second-brain-"),
                        *(["--ids"] if "--ids" in b.read_text(encoding="utf-8") else []),  # older builders: no ids
                        *(["--fetch"] if fetch else [])],
                       capture_output=True, text=True, env={**os.environ, "DARWIN_OFFLINE": "1"})
    print(f"[{time.strftime('%H:%M:%S')}] page rebuilt" + ("" if r.returncode == 0 else f" (failed: {r.stdout[-300:]}{r.stderr[-300:]})"),
          flush=True)


def watch(brain: Path) -> None:
    """Rebuild when a brain file changes (after a short quiet spell) or when asked (with a fetch)."""
    last = sources_mtime(brain)
    while True:
        asked = REBUILD.wait(1.0)
        REBUILD.clear()
        if asked or sources_mtime(brain) != last:
            time.sleep(0 if asked else 0.8)  # let a burst of edits land
            rebuild(brain, fetch=asked)
            last = sources_mtime(brain)  # after the build: --ids writes todo.md, never a loop


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("brain", nargs="?")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--tty-port", type=int, default=7681)
    ap.add_argument("--no-open", action="store_true")
    a = ap.parse_args()

    url = f"http://127.0.0.1:{a.port}/"
    try:  # already running (the morning hook, another chat): just open it, never a second server
        import urllib.request
        urllib.request.urlopen(url + "__mtime", timeout=1).read()
        if not a.no_open:
            webbrowser.open(url)
        print(f"Second brain live is already running: {url}", flush=True)
        return
    except OSError:
        pass
    brain = find_brain(a.brain)
    page_dir = brain / "local" / "second_brain_report"
    for tool in ("ttyd", "tmux"):
        if not shutil.which(tool):
            sys.exit(f"{tool} is missing: {INSTALL}")
    prompt = agent_prompt()
    if not (page_dir / "index.html").is_file():
        rebuild(brain, fetch=False)

    url_rebuild = f"http://127.0.0.1:{a.port}/__rebuild"
    # The conversation lives in a tmux session the launcher starts on its own, detached and in its own process
    # session: ttyd only attaches to it, so stopping ttyd or this script never ends it. Kept if it already exists.
    if subprocess.run(["tmux", "has-session", "-t", SESSION], capture_output=True).returncode != 0:
        subprocess.run(["tmux", "new-session", "-d", "-s", SESSION, "-x", "200", "-y", "50", "-c", str(brain),
                        "-e", f"BRAIN_LIVE_REBUILD={url_rebuild}", "claude", "--append-system-prompt", prompt],
                       check=True, start_new_session=True)
        for opt in (("mouse", "on"), ("status", "off")):
            subprocess.run(["tmux", "set-option", "-t", SESSION, *opt], capture_output=True)
    index = tty_index(a.tty_port)
    tty = subprocess.Popen(
        ["ttyd", "-W", "-i", "127.0.0.1", "-p", str(a.tty_port), "-w", str(brain), "-t", "fontSize=13",
         *(["-I", str(index)] if index else []),
         "-t", "titleFixed=brain-keeper",
         "tmux", "attach-session", "-t", SESSION])
    shell = SHELL.replace("__TTY__", str(a.tty_port)).encode()

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kw):
            super().__init__(*args, directory=str(page_dir), **kw)

        def log_message(self, *args):
            pass

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def do_GET(self):
            if self.path in ("/", "/index.html"):
                self._send(shell, "text/html; charset=utf-8")
            elif self.path == "/__mtime":
                m = max((p.stat().st_mtime for p in page_dir.rglob("*") if p.is_file()), default=0)
                self._send(json.dumps({"mtime": m}).encode(), "application/json")
            elif self.path.startswith("/report/"):
                self.path = self.path[len("/report"):]
                super().do_GET()
            else:
                self.send_error(404)

        def do_POST(self):
            if self.path == "/__rebuild":
                REBUILD.set()
                self._send(b"{}", "application/json")
            else:
                self.send_error(404)

        def _send(self, body: bytes, ctype: str):
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    threading.Thread(target=watch, args=(brain,), daemon=True).start()

    def stop(*_):
        tty.terminate()
        os._exit(0)

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    print(f"Second brain live: {url} ({brain.name}; Ctrl-C stops it)", flush=True)
    if not a.no_open:
        webbrowser.open(url)
    srv.serve_forever()


if __name__ == "__main__":
    main()
