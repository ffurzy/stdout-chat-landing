# CLAUDE.md (landing)

Project-local overrides for the `landing/` repo. The root `stdout-chat/CLAUDE.md` still applies; rules below take precedence inside this directory.

## Commit attribution

**Do not add Co-Authored-By trailers, "Generated with Claude Code" footers, or any other Claude/Anthropic attribution to commit messages.** Commits in this repo must look authored solely by the user.

This overrides the global "git commit" template that ends with `Co-Authored-By: Claude …`. When committing in `landing/`, omit that trailer entirely. Do not add a robot emoji, a `claude.com/claude-code` link, or any equivalent marker.

The local `user.email` is set to `185406834+ffurzy@users.noreply.github.com` (GitHub no-reply) — do not change it. GitHub email-privacy protection rejects pushes that expose `ffurzy@gmail.com`.

## PRs

Same rule for PR titles and bodies created via `gh pr create`: no Claude attribution, no robot emoji, no "Generated with" footer.
