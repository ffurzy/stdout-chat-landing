#!/usr/bin/env node
// append-update.js
// Reads the latest commit message from env, parses it, prepends to updates.json.
// Skips if the commit SHA is already recorded (duplicate prevention).

const fs = require("fs");
const path = require("path");

const UPDATES_FILE = path.join(__dirname, "..", "updates.json");

const PREFIXES = {
  "fix:":     "fix",
  "feat:":    "feat",
  "improve:": "impr",
};

const MAX_TITLE_LENGTH = 80;
const PIPE_SEPARATOR   = " | ";

// ── inputs from env ──────────────────────────────────────────────────────────
const rawCommitMsg = (process.env.COMMIT_MESSAGE || "").trim();
const commitSha    = (process.env.COMMIT_SHA     || "").trim();
const commitDate   = (process.env.COMMIT_DATE    || new Date().toISOString().slice(0, 10)).trim();

if (!rawCommitMsg) {
  console.log("No COMMIT_MESSAGE provided — skipping.");
  process.exit(0);
}

// ── split into title line + optional body (multiline commit messages) ─────────
// git commit -m "fix: title" -m "body text" produces "fix: title\n\nbody text"
const [firstLine, ...bodyLines] = rawCommitMsg.split("\n");
const commitFirstLine = firstLine.trim();

// ── check prefix (case-insensitive match, slice on lowercased line) ───────────
let matchedPrefix = null;
let matchedType   = null;

const lowerFirst = commitFirstLine.toLowerCase();
for (const [prefix, type] of Object.entries(PREFIXES)) {
  if (lowerFirst.startsWith(prefix)) {
    matchedPrefix = prefix;
    matchedType   = type;
    break;
  }
}

if (!matchedPrefix) {
  console.log(`Commit does not match any tracked prefix — skipping.\nMessage: "${commitFirstLine}"`);
  process.exit(0);
}

// ── load existing entries ─────────────────────────────────────────────────────
let entries = [];
if (fs.existsSync(UPDATES_FILE)) {
  try {
    entries = JSON.parse(fs.readFileSync(UPDATES_FILE, "utf8"));
  } catch (e) {
    console.error("Failed to parse updates.json:", e.message);
    process.exit(1);
  }
}

// ── duplicate check (by commit SHA stored in hidden field) ────────────────────
if (commitSha && entries.some((e) => e._sha === commitSha)) {
  console.log(`Commit ${commitSha} already recorded — skipping duplicate.`);
  process.exit(0);
}

// ── normalise title ───────────────────────────────────────────────────────────
// Slice at prefix length (from lowercase version, same length), trim, collapse spaces
let rawTitle = commitFirstLine.slice(matchedPrefix.length).trim();

// Support inline body via pipe separator: "fix: title | body description"
let inlineBody = "";
const pipeIdx = rawTitle.indexOf(PIPE_SEPARATOR);
if (pipeIdx !== -1) {
  inlineBody = rawTitle.slice(pipeIdx + PIPE_SEPARATOR.length).trim();
  rawTitle   = rawTitle.slice(0, pipeIdx).trim();
}

// Collapse duplicate whitespace
rawTitle = rawTitle.replace(/\s+/g, " ").trim();

// Capitalise first letter
rawTitle = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);

// Enforce max length (truncate at word boundary)
if (rawTitle.length > MAX_TITLE_LENGTH) {
  rawTitle = rawTitle.slice(0, MAX_TITLE_LENGTH).replace(/\s+\S*$/, "") + "…";
}

const title = rawTitle;

// ── resolve body ──────────────────────────────────────────────────────────────
// Priority: inline pipe body > git commit body lines > empty
let body = "";
if (inlineBody) {
  body = inlineBody;
} else {
  // Join non-empty body lines (skip the blank separator line git adds)
  const joinedBody = bodyLines.filter((l) => l.trim()).join(" ").trim();
  if (joinedBody) {
    body = joinedBody;
  }
}

// ── build new entry ───────────────────────────────────────────────────────────
const entry = {
  date:  commitDate,
  type:  matchedType,
  title: title,
  body:  body,
};

// Store SHA for duplicate prevention (hidden, not rendered by updates.html)
if (commitSha) {
  entry._sha = commitSha;
}

// ── prepend and write ─────────────────────────────────────────────────────────
entries.unshift(entry);
fs.writeFileSync(UPDATES_FILE, JSON.stringify(entries, null, 2) + "\n", "utf8");

console.log(`✅ Appended update:
  type:  ${entry.type}
  title: ${entry.title}
  body:  ${entry.body || "(empty)"}
  date:  ${entry.date}
  sha:   ${entry._sha || "(none)"}`);
