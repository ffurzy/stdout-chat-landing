#!/usr/bin/env node
// build-updates.js
// Parses VoidChat/CHANGELOG.md ("What's New" sections only, App-facing)
// into a structured updates.json. Ignores "Technical" / "Build" / "Verification".
//
// Source of truth = the CHANGELOG, NOT git commit messages.
// Replaces the old commit-message parser (append-update.js).
//
// Usage:
//   CHANGELOG_PATH=/path/to/CHANGELOG.md node scripts/build-updates.js
//   (defaults to ../VoidChat/CHANGELOG.md relative to this repo if env unset —
//    used for local dry-runs against a sibling checkout)
//
// Output: ../updates.json (array, newest first), each release:
//   { version, date, title, items: [{ category, text }], tags: [categories] }

const fs = require("fs");
const path = require("path");

const OUT_FILE = path.join(__dirname, "..", "updates.json");

// CHANGELOG location: explicit env wins; else try a couple of sane defaults.
const CANDIDATE_PATHS = [
  process.env.CHANGELOG_PATH,
  path.join(__dirname, "..", "VoidChat", "CHANGELOG.md"),        // CI: VoidChat checked out into landing/VoidChat
  path.join(__dirname, "..", "..", "VoidChat", "CHANGELOG.md"),  // local: sibling dir under stdout-chat/
].filter(Boolean);

const CHANGELOG_PATH = CANDIDATE_PATHS.find((p) => p && fs.existsSync(p));

if (!CHANGELOG_PATH) {
  console.error("CHANGELOG.md not found. Tried:\n  " + CANDIDATE_PATHS.join("\n  "));
  process.exit(1);
}

// ── category inference ────────────────────────────────────────────────────────
// Optional explicit inline tag wins: "[new] ...", "[fixed] ...", etc.
// Otherwise keyword heuristics on the paragraph text.
const EXPLICIT_TAG = /^\s*\[(new|fixed|fix|improved|improvement|security)\]\s*/i;

const SECURITY_RE = /\b(secur|vulnerab|exploit|abuse|rate.?limit|certificate|pinning|encrypt|privacy|fraud)\w*/i;
const FIX_RE      = /\b(fix(?:ed|es)?|bug|crash|issue|broke?n?|resolve[ds]?|no longer|stability|stable|reliab\w*)\b/i;
const IMPROVE_RE  = /\b(improv\w*|faster|smoother|smooth|refin\w*|better|optimi[sz]\w*|polish\w*|cleaner|performance)\b/i;

function inferCategory(text) {
  const explicit = text.match(EXPLICIT_TAG);
  if (explicit) {
    const t = explicit[1].toLowerCase();
    if (t === "fix") return "fix";
    if (t === "fixed") return "fix";
    if (t === "improved" || t === "improvement") return "imp";
    if (t === "security") return "sec";
    if (t === "new") return "new";
  }
  // Heuristic precedence: security > improvement > fix > new.
  // "improvement" is checked before "fix" so phrases like
  // "stability improvements" land in IMPROVED, not FIXED.
  if (SECURITY_RE.test(text)) return "sec";
  if (IMPROVE_RE.test(text))  return "imp";
  if (FIX_RE.test(text))      return "fix";
  return "new";
}

function stripExplicitTag(text) {
  return text.replace(EXPLICIT_TAG, "").trim();
}

// ── parse ─────────────────────────────────────────────────────────────────────
const raw = fs.readFileSync(CHANGELOG_PATH, "utf8");
const lines = raw.split("\n");

// A release starts at "## [X.Y.Z] — YYYY-MM-DD" (em-dash or hyphen, flexible spacing).
const RELEASE_HEAD = /^##\s*\[([0-9]+(?:\.[0-9]+)*)\]\s*[—–-]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/;
const SECTION_HEAD = /^###\s+(.+?)\s*$/;
const FENCE        = /^```/;

const releases = [];
let cur = null;          // current release object
let section = null;      // current "### X" section name (lowercased)
let inFence = false;     // inside a ``` code fence
const fenceBuf = [];     // collected fenced lines for the current What's New block

function flushFence() {
  if (!cur || section !== "what's new" || fenceBuf.length === 0) {
    fenceBuf.length = 0;
    return;
  }
  // Group fenced lines into paragraphs (blank line = separator).
  const text = fenceBuf.join("\n");
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const p of paragraphs) {
    const category = inferCategory(p);
    cur.items.push({ category, text: stripExplicitTag(p) });
  }
  fenceBuf.length = 0;
}

for (const line of lines) {
  const head = line.match(RELEASE_HEAD);
  if (head) {
    // close previous
    if (inFence) { inFence = false; flushFence(); }
    if (cur) releases.push(cur);
    cur = { version: head[1], date: head[2], items: [] };
    section = null;
    continue;
  }
  if (!cur) continue; // skip preamble before first release

  const sec = line.match(SECTION_HEAD);
  if (sec && !inFence) {
    section = sec[1].trim().toLowerCase();
    continue;
  }

  if (FENCE.test(line)) {
    if (inFence) { inFence = false; flushFence(); }
    else if (section === "what's new") { inFence = true; }
    continue;
  }

  if (inFence && section === "what's new") {
    fenceBuf.push(line);
  }
}
// EOF flush
if (inFence) flushFence();
if (cur) releases.push(cur);

// ── derive title + aggregate tags per release ────────────────────────────────
// Title: short headline for the card. Derived from the release — we use the
// first item's text trimmed to one sentence, or a category-based fallback.
const CATEGORY_ORDER = ["new", "fix", "imp", "sec"]; // display order for tag chips

function deriveTitle(rel) {
  if (rel.items.length === 0) return `Version ${rel.version}.`;
  const first = rel.items[0].text;
  // Headline = first clause: split on sentence end OR " — " / " : " separators,
  // whichever comes first. Keeps the card's <h2> short instead of echoing body.
  let t = first.split(/(?<=[.!?])\s|\s[—–:]\s/)[0].trim();
  // Ensure it ends cleanly with a period if it was a full clause.
  if (t.length > 70) {
    t = t.slice(0, 70).replace(/\s+\S*$/, "") + "…";
  } else if (!/[.!?…]$/.test(t)) {
    t += ".";
  }
  return t;
}

const out = releases.map((rel) => {
  const tagSet = new Set(rel.items.map((i) => i.category));
  const tags = CATEGORY_ORDER.filter((c) => tagSet.has(c));
  return {
    version: rel.version,
    date: rel.date,
    title: deriveTitle(rel),
    tags,
    items: rel.items,
  };
});

if (out.length === 0) {
  console.error("Parsed 0 releases — refusing to overwrite updates.json. Check CHANGELOG format.");
  process.exit(1);
}

fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");

console.log(`Parsed ${out.length} releases from ${CHANGELOG_PATH}`);
for (const r of out) {
  console.log(`  v${r.version} (${r.date}) — ${r.items.length} item(s) [${r.tags.join(",") || "none"}]`);
}
