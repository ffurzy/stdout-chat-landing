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

// ── inputs from env ──────────────────────────────────────────────────────────
const commitMsg = (process.env.COMMIT_MESSAGE || "").trim();
const commitSha = (process.env.COMMIT_SHA     || "").trim();
const commitDate = (process.env.COMMIT_DATE   || new Date().toISOString().slice(0, 10)).trim();

if (!commitMsg) {
  console.log("No COMMIT_MESSAGE provided — skipping.");
  process.exit(0);
}

// ── check prefix ─────────────────────────────────────────────────────────────
let matchedPrefix = null;
let matchedType   = null;

for (const [prefix, type] of Object.entries(PREFIXES)) {
  if (commitMsg.toLowerCase().startsWith(prefix)) {
    matchedPrefix = prefix;
    matchedType   = type;
    break;
  }
}

if (!matchedPrefix) {
  console.log(`Commit does not match any tracked prefix — skipping.\nMessage: "${commitMsg}"`);
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

// ── build new entry ───────────────────────────────────────────────────────────
const rawTitle = commitMsg.slice(matchedPrefix.length).trim();

// Capitalise first letter
const title = rawTitle.charAt(0).toLowerCase() + rawTitle.slice(1);

const entry = {
  date:  commitDate,
  type:  matchedType,
  title: title,
  body:  "",
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
  date:  ${entry.date}
  sha:   ${entry._sha || "(none)"}`);
