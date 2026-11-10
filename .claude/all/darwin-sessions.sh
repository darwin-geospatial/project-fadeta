#!/usr/bin/env bash
# Darwin sessions view: what the agents did in this repo and why, in VS Code (Gabriel, 2026-11-09, row 055).
# Single source: admin-darwin-agents/templates/context/claude-all/ (never edit a copy).
#   bash .claude/all/darwin-sessions.sh            this repo's sessions as Markdown, opened in VS Code with the why log
#   bash .claude/all/darwin-sessions.sh --serve    every session of every repo, searchable, in the browser
# It runs claude-code-log at the version pinned in third_party.json (never a copy of its code). The pages hold
# everything said to the agents, so they are private: they go to the person's second brain local/agent_sessions/<repo>/
# (local/ is never in git), or ~/.cache/darwin/agent_sessions/<repo>/ without a second brain.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
exec python3 - "$HERE" "${1:-}" <<'PY'
import json, os, pathlib, re, shutil, subprocess, sys
here, mode = pathlib.Path(sys.argv[1]), sys.argv[2]
tool = next(t for t in json.loads((here / "third_party.json").read_text())["tools"] if t["name"] == "claude-code-log")
spec = f"{tool['name']}=={tool['version']}"
if shutil.which("uvx"):
    run = ["uvx", "--from", spec, "claude-code-log"]
elif shutil.which("pipx"):
    run = ["pipx", "run", "--spec", spec, "claude-code-log"]
else:
    sys.exit("darwin-sessions: needs uv (it runs the pinned claude-code-log). Install it once: "
             "Mac `brew install uv`, Linux or Windows: https://docs.astral.sh/uv/getting-started/installation/")
start = pathlib.Path(os.environ.get("CLAUDE_PROJECT_DIR") or ".")
top = subprocess.run(["git", "-C", str(start), "rev-parse", "--show-toplevel"], capture_output=True, text=True)
root = pathlib.Path(top.stdout.strip()) if top.returncode == 0 else start.resolve()
if mode == "--serve":
    os.execvp(run[0], run + ["serve"])
cache = pathlib.Path(os.environ.get("DARWIN_CACHE") or pathlib.Path.home() / ".cache" / "darwin")
name_file = cache / "second-brain"
brain_name = name_file.read_text().strip() if name_file.exists() else ""
brain = root if brain_name and root.name == brain_name else root.parent / brain_name if brain_name else None
base = brain / "local" / "agent_sessions" if brain and (brain / ".git").exists() else cache / "agent_sessions"
encoded = re.sub(r"[^A-Za-z0-9]", "-", str(root.resolve()))  # Claude Code's folder name for this repo
if not (pathlib.Path.home() / ".claude" / "projects" / encoded).is_dir():
    sys.exit(f"darwin-sessions: no Claude Code sessions for {root} yet")
base.mkdir(parents=True, exist_ok=True)
# --all-projects with --filter-path is the mode that honours -o (a single folder is written next to the JSONL files)
r = subprocess.run(run + ["--all-projects", "--filter-path", encoded, "--format", "md", "--combined", "no",
                          "-o", str(base)], capture_output=True, text=True)
out = base / encoded
if r.returncode != 0:
    sys.exit("darwin-sessions: claude-code-log failed:\n" + (r.stderr or r.stdout)[-2000:])
pages = sorted(out.rglob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)
why = root / "planning" / "why.md"
if not why.exists():
    why = cache / "why" / f"{root.name}.md"
print(f"sessions: {len(pages)} page(s) in {out}")
print(f"why log: {why if why.exists() else 'none yet'}")
opener = shutil.which("code")
targets = [str(p) for p in ([pages[0]] if pages else []) + ([why] if why.exists() else [])]
if opener and targets and os.environ.get("DARWIN_SESSIONS_OPEN", "1") != "0":
    subprocess.run([opener, "-r", *targets])
elif not opener:
    print("VS Code's `code` command is not on PATH (VS Code: Cmd+Shift+P, 'Shell Command: Install code'); open the files above.")
PY
