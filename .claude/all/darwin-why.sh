#!/usr/bin/env bash
# Darwin why log: one line per agent decision a Darwin rule made, so people understand the agents (Gabriel,
# 2026-11-09, row 054). Single source: admin-darwin-agents/templates/context/claude-all/ (never edit a copy).
#   bash .claude/all/darwin-why.sh "<what happened>" "<why>" "<rule or source>"
# The hooks call it on every refusal and every STOP opened or closed; an agent calls it by hand when it declines
# or chooses on a rule. It writes planning/why.md of the repo (the team reads it in VS Code and it is committed
# with the rest of planning/), or ~/.cache/darwin/why/<repo>.md when the repo has no planning/. The same line twice
# within 10 minutes is written once. It never fails the caller.
set -uo pipefail
exec python3 - "${1:-}" "${2:-}" "${3:-}" <<'PY' 2>/dev/null || true
import datetime, json, os, pathlib, re, subprocess, sys
what, why, rule = (" ".join(a.split()) for a in sys.argv[1:4])
if not what:
    sys.exit(0)
start = pathlib.Path(os.environ.get("CLAUDE_PROJECT_DIR") or ".")
top = subprocess.run(["git", "-C", str(start), "rev-parse", "--show-toplevel"], capture_output=True, text=True)
root = pathlib.Path(top.stdout.strip()) if top.returncode == 0 else start.resolve()
def repo_id() -> str:
    try:
        rj = json.loads((root / ".darwin" / "repo.json").read_text())
        rid = (rj.get("identity") or rj).get("id")
        if rid:
            return rid
    except Exception:
        pass
    return root.name
cache = pathlib.Path(os.environ.get("DARWIN_CACHE") or pathlib.Path.home() / ".cache" / "darwin")
log = root / "planning" / "why.md" if (root / "planning").is_dir() else cache / "why" / f"{repo_id()}.md"
log.parent.mkdir(parents=True, exist_ok=True)
if not log.exists():
    log.write_text("# Why log\n\nOne line per decision a Darwin rule made in this repo: what happened, why, and the rule"
                   " behind it. Written by the Darwin hooks (`.claude/all/darwin-why.sh`); never edit a line, add a new"
                   " one.\n\n")
email = subprocess.run(["git", "-C", str(root), "config", "user.email"], capture_output=True, text=True).stdout.strip()
who = email.split("@")[0] or os.environ.get("USER", "someone")
body = f"{who} · {what}" + (f" · why: {why}" if why else "") + (f" · rule: {rule}" if rule else "")
now = datetime.datetime.now()
lines = log.read_text().splitlines()
last = next((l for l in reversed(lines) if l.startswith("- ")), "")
m = re.match(r"- (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) · (.*)", last)
if m and m.group(2) == body and now - datetime.datetime.strptime(m.group(1), "%Y-%m-%d %H:%M") < datetime.timedelta(minutes=10):
    sys.exit(0)
with log.open("a") as f:
    f.write(f"- {now:%Y-%m-%d %H:%M} · {body}\n")
PY
