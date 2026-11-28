# CLAUDE.md

Read `AGENTS.md` first; it holds the rules for this repository. This file only adds what is specific to Claude Code.

- Prefer `npm test` over running single files when you claim the suite is green; quote the `tests / pass / fail / skipped` lines.
- Before saying a page works, open it in the browser preview. `.claude/` is git-ignored, so create `.claude/launch.json` with a `yocv` entry (`node server.js`, port 4174) if it is missing. YoVouch demo pages need `YOVOUCH_SIM=1`.
- Commit on a branch and keep `reports/`, `research_notes/`, `.env` and `data/cards/` out of every commit.
