#!/usr/bin/env node
// render-updates.js
// Reads updates.json + updates.html (as template), regenerates ONLY the
// data-driven blocks between BUILD markers, writes updates.html back.
//
// Data is baked into the static HTML at build time (SEO: no client fetch).
// Design / head / security / footer / filter JS are untouched — we only swap
// the content between the marker comments, so the generator is idempotent.
//
// Markers in updates.html:
//   <!-- BUILD:meta -->     ... <!-- /BUILD:meta -->     (page-meta line)
//   <!-- BUILD:filters -->  ... <!-- /BUILD:filters -->  (filter chips + counts)
//   <!-- BUILD:feed -->     ... <!-- /BUILD:feed -->      (release cards)
//
// Usage: node scripts/render-updates.js

const fs = require("fs");
const path = require("path");

const JSON_FILE = path.join(__dirname, "..", "updates.json");
const HTML_FILE = path.join(__dirname, "..", "updates.html");

const data = JSON.parse(fs.readFileSync(JSON_FILE, "utf8"));
let html = fs.readFileSync(HTML_FILE, "utf8");

if (!Array.isArray(data) || data.length === 0) {
  console.error("updates.json empty or invalid — aborting render.");
  process.exit(1);
}

// ── helpers ──────────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso) {
  // iso = YYYY-MM-DD
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
function fmtDateLong(iso) {
  const MONTHS_LONG = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} ${d}, ${y}`;
}

const TAG_CLASS = { new: "rt-new", fix: "rt-fix", imp: "rt-imp", sec: "rt-sec" };
const TAG_LABEL = { new: "NEW", fix: "FIXED", imp: "IMPROVED", sec: "SECURITY" };
const LI_TAG_CLASS = { new: "tag", fix: "tag fix", imp: "tag imp", sec: "tag sec" };

// ── derive page-meta from latest release ─────────────────────────────────────
const latest = data[0];
const metaHtml =
  `<span>currently on <code>v${escapeHtml(latest.version)}</code></span>\n` +
  `      <span>last shipped <b>${escapeHtml(fmtDateLong(latest.date))}</b></span>`;

// ── derive filter counts ─────────────────────────────────────────────────────
// "all" counts releases; each category counts releases that contain it (matches
// the existing client-side filter, which shows/hides whole release cards).
const counts = { all: data.length, new: 0, fix: 0, imp: 0, sec: 0 };
for (const rel of data) {
  for (const c of new Set(rel.tags)) {
    if (counts[c] !== undefined) counts[c] += 1;
  }
}
const filtersHtml =
  `<span class="chip on" data-filter="all">all <span class="ct">${counts.all}</span></span>\n` +
  `      <span class="chip" data-filter="new">new <span class="ct">${counts.new}</span></span>\n` +
  `      <span class="chip" data-filter="fix">fixed <span class="ct">${counts.fix}</span></span>\n` +
  `      <span class="chip" data-filter="imp">improved <span class="ct">${counts.imp}</span></span>\n` +
  `      <span class="chip" data-filter="sec">security <span class="ct">${counts.sec}</span></span>`;

// ── render feed cards ────────────────────────────────────────────────────────
function renderRelease(rel, isLatest) {
  const tagChips = rel.tags
    .map((c) => `              <span class="rt ${TAG_CLASS[c]}">${TAG_LABEL[c]}</span>`)
    .join("\n");

  const items = rel.items
    .map((it) =>
      `              <li><span class="${LI_TAG_CLASS[it.category]}">${TAG_LABEL[it.category]}</span>` +
      `<span>${escapeHtml(it.text)}</span></li>`
    )
    .join("\n");

  return (
`      <div class="release${isLatest ? " latest" : ""}">
        <div class="release-meta">
          <span class="v">v${escapeHtml(rel.version)}</span>
          <span class="d">${escapeHtml(fmtDate(rel.date))}</span>
        </div>
        <div class="release-card">
          <div class="release-head">
            <h2>${escapeHtml(rel.title)}</h2>
            <div class="release-tags">
${tagChips}
            </div>
          </div>
          <div class="release-body">
            <ul class="change-list">
${items}
            </ul>
          </div>
        </div>
      </div>`
  );
}

const feedHtml = data.map((rel, i) => renderRelease(rel, i === 0)).join("\n\n");

// ── splice into template between markers ─────────────────────────────────────
function splice(markerName, replacement) {
  const open = `<!-- BUILD:${markerName} -->`;
  const close = `<!-- /BUILD:${markerName} -->`;
  const re = new RegExp(
    open.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
    "[\\s\\S]*?" +
    close.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  if (!re.test(html)) {
    console.error(`Marker ${markerName} not found in updates.html — aborting.`);
    process.exit(1);
  }
  html = html.replace(re, `${open}\n      ${replacement}\n      ${close}`);
}

splice("meta", metaHtml);
splice("filters", filtersHtml);

// feed marker uses different indentation context (inside .feed)
{
  const open = `<!-- BUILD:feed -->`;
  const close = `<!-- /BUILD:feed -->`;
  const re = new RegExp(
    open.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
    "[\\s\\S]*?" +
    close.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  if (!re.test(html)) {
    console.error("Marker feed not found in updates.html — aborting.");
    process.exit(1);
  }
  html = html.replace(re, `${open}\n\n${feedHtml}\n\n      ${close}`);
}

fs.writeFileSync(HTML_FILE, html, "utf8");

// ── sync <lastmod> for /updates in sitemap.xml ───────────────────────────────
// Bumps the /updates <lastmod> to the latest release date. Never regresses:
// if the sitemap already has a newer date (manual bump), it is kept as-is —
// so the render stays idempotent.
const SITEMAP_FILE = path.join(__dirname, "..", "sitemap.xml");
try {
  let sm = fs.readFileSync(SITEMAP_FILE, "utf8");
  const lmRe = /(<loc>https:\/\/stdout\.chat\/updates<\/loc>\s*<lastmod>)(\d{4}-\d{2}-\d{2})(<\/lastmod>)/;
  const m = sm.match(lmRe);
  if (m) {
    const current = m[2];
    const next = latest.date > current ? latest.date : current;
    if (next !== current) {
      sm = sm.replace(lmRe, `$1${next}$3`);
      fs.writeFileSync(SITEMAP_FILE, sm, "utf8");
      console.log(`  sitemap: /updates lastmod ${current} → ${next}`);
    }
  } else {
    console.warn("  sitemap: /updates <lastmod> not found — skipped.");
  }
} catch (e) {
  console.warn(`  sitemap: lastmod sync failed — ${e.message}`);
}

console.log(`Rendered updates.html from ${data.length} releases.`);
console.log(`  latest: v${latest.version} (${fmtDateLong(latest.date)})`);
console.log(`  counts: all=${counts.all} new=${counts.new} fix=${counts.fix} imp=${counts.imp} sec=${counts.sec}`);
