#!/usr/bin/env bash
# Darwin checks, counted locally (UserPromptSubmit hook). Single source:
# admin-darwin-agents/templates/context/claude-all/ (copied to every repo's .claude/all/; never edit a copy).
# Stable on purpose: which checks exist, how often and where comes from the center as data
# (GET /api/v1/ticks?repo=<id>), cached once a day in ~/.cache/darwin/. No network on most messages. A row fires every
# N messages (`every`), by chance (`chance`) or when the prompt matches its `trigger` regex.
set -euo pipefail
INPUT="$(cat)"
exec python3 - "$INPUT" <<'PY'
import json, os, pathlib, random, re, subprocess, sys, time, urllib.request
URL = os.environ.get("DARWIN_CENTER_URL", "https://admin-darwin-agent-center-721070867001.europe-west1.run.app")
try:
    event = json.loads(sys.argv[1] or "{}")
except json.JSONDecodeError:
    event = {}
root = pathlib.Path(os.environ.get("CLAUDE_PROJECT_DIR") or event.get("cwd") or ".")
session = re.sub(r"[^A-Za-z0-9_-]", "", str(event.get("session_id") or "no-session")) or "no-session"
cache = pathlib.Path(os.environ.get("DARWIN_CACHE") or pathlib.Path.home() / ".cache" / "darwin")
(cache / "sessions").mkdir(parents=True, exist_ok=True)
(cache / "stops").mkdir(parents=True, exist_ok=True)

def repo_id() -> str:
    try:
        rj = json.loads((root / ".darwin" / "repo.json").read_text())
        rid = (rj.get("identity") or rj).get("id")
        if rid:
            return rid
    except Exception:
        pass
    r = subprocess.run(["git", "-C", str(root), "remote", "get-url", "origin"], capture_output=True, text=True)
    return re.sub(r"\.git$", "", r.stdout.strip().rstrip("/").split("/")[-1]) if r.returncode == 0 and r.stdout.strip() else root.name

def why(what: str, reason: str, rule: str) -> None:  # the why log (darwin-why.sh, row 054); never fails the hook
    try:
        top = pathlib.Path(os.environ.get("CLAUDE_PROJECT_DIR") or event.get("cwd") or ".")
        subprocess.run(["bash", str(top / ".claude" / "all" / "darwin-why.sh"), what, reason, rule], timeout=3,
                       env={**os.environ, "CLAUDE_PROJECT_DIR": str(top)}, capture_output=True)
    except Exception:
        pass
repo = repo_id()
table = cache / f"ticks-{repo}.json"
if not table.exists() or time.time() - table.stat().st_mtime > 86400:
    try:
        with urllib.request.urlopen(f"{URL}/api/v1/ticks?repo={repo}", timeout=2) as resp:
            table.write_text(json.dumps(json.load(resp)["data"]))
    except Exception:
        pass  # keep the old copy; never block a message on the network
try:
    rows = json.loads(table.read_text())
except Exception:
    sys.exit(0)

counter = cache / "sessions" / session
count = (int(counter.read_text() or 0) if counter.exists() else 0) + 1
counter.write_text(str(count))

best = {}
for r in rows:
    if r.get("every") and count % int(r["every"]) == 0:
        fam = r.get("family") or r["id"]
        if fam not in best or int(r["every"]) > int(best[fam]["every"]):
            best[fam] = r
due = list(best.values()) + [r for r in rows if r.get("chance") and random.random() < float(r["chance"])]
prompt = str(event.get("prompt") or "")
for r in rows:  # `trigger` rows: the prompt's own words call the check (e.g. a report, plan or summary calls Robin)
    try:
        if r.get("trigger") and r not in due and re.search(r["trigger"], prompt, re.I):
            due.append(r)
    except re.error:
        pass

stops_file = cache / "stops" / f"{repo}.json"
stops = json.loads(stops_file.read_text()) if stops_file.exists() else {}
for r in due:
    if r.get("blocking") == "yes" and r["id"] not in stops:
        stops[r["id"]] = {"since": count, "call": r["call"]}
        why(f"STOP opened: {r['id']} (message {count})", r.get("description", ""), r["call"])
stops_file.write_text(json.dumps(stops))

# Every check runs in a background subagent, never in the main agent (Gabriel, 2026-11-16: "Robin checks should
# always be subagents, never stop the main agent"). The main agent starts it and keeps working; the subagent does the
# check, fixes or reports, and closes its STOP itself with darwin-done.sh.
PARALLEL = " [blocking check: the subagent closes it with darwin-done.sh when done]"
lines = [f"- {r['id']}: if {r['applies_when']}, call {r['call']} and do it ({r['description']})"
         + (PARALLEL if r.get("blocking") == "yes" else "") for r in due]
due_ids = {r["id"] for r in due}
lines = [f"- OPEN STOP {sid} (since message {st['since']}): its subagent is on it; keep working on everything, "
         f"commit and push included. The subagent closes it: `bash .claude/all/darwin-done.sh {sid} clear` "
         f"(nothing found) or `fixed` (every BLOCK fixed); if no subagent is running it, start one in the background"
         for sid, st in stops.items() if sid not in due_ids] + lines
if lines:
    msg = (f"Darwin checks due (message {count}, repo {repo}):\n" + "\n".join(lines)
           + "\nRun EVERY check in a background subagent (Agent tool, run_in_background: true), never in the main "
             "agent: start it, say it in one visible line (e.g. `Robin (report): checking in a subagent`) and keep "
             "working on the person's task without waiting. Report the subagent's result in one line when it lands.")
    if due and sys.platform == "darwin" and os.environ.get("DARWIN_NOTIFY", "1") != "0":
        try:  # a desktop notification that Robin is on it (Gabriel, 2026-10-26); never blocks the prompt
            subprocess.Popen(["osascript", "-e", 'display notification "' + ", ".join(r["id"] for r in due)
                              + '" with title "Robin is on it"'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except OSError:
            pass
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": msg}}))
PY
