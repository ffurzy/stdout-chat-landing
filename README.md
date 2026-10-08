# stdout.chat — landing site

Static site for [stdout.chat](https://stdout.chat), an anonymous text-only chat app for iOS. Marketing pages, guides, legal pages, the release notes page and a read-only web view of the public `#void` room.

## Layout

```
*.html              one file per page; clean URLs are mapped in vercel.json
css/                shared styles (style.css, redesign.css, type.css) + per-page sheets
js/                 topbar-count.js (live join counter), guide-cta.js (mobile app bar),
                    void-web.js (#void live feed)
fonts/              Geist and JetBrains Mono, self-hosted woff2
img/, screenshots/  Open Graph images and App Store screenshots
scripts/            build-updates.js, render-updates.js, og/render.mjs
.well-known/        apple-app-site-association for universal links
vercel.json         redirects, rewrites, headers
sitemap.xml, robots.txt, llms.txt, site.webmanifest
```

No framework, no build step for the pages themselves. Every page is hand-written HTML with the full `<head>` (meta, Open Graph, JSON-LD) inline.

## How it works

**Routing.** `vercel.json` rewrites clean paths to the `.html` files (`/guides` → `/guides.html`), redirects `www` to the apex domain, and maps `/i/:code` invite links to `i.html`. Security headers (HSTS, CSP, `X-Frame-Options`) and cache rules for static assets live there too.

**`/void`.** The public room is served with content negotiation in `vercel.json`: requests with `Accept: application/json` or `text/plain`, or from terminal clients (curl, wget, HTTPie, the stdout-chat CLI), are rewritten to `https://api.stdout.chat/void`; browsers get `void.html`. The page loads history from the API and follows the room live over a Server-Sent Events stream (`js/void-web.js`). All room text is rendered with `textContent` only.

**Release notes.** `updates.html` is generated. The GitHub Actions workflow in `.github/workflows/updates.yml` is triggered by a `repository_dispatch` from the iOS repository whenever its `CHANGELOG.md` changes. It parses the "What's New" sections into `updates.json` (`scripts/build-updates.js`), re-renders the data-driven blocks between the `BUILD` markers in `updates.html` (`scripts/render-updates.js`), bumps the `/updates` entry in `sitemap.xml` and commits the result.

**Open Graph images.** `scripts/og/render.mjs` renders a 1200×630 PNG for every entry in `scripts/og/pages.json` with headless Chrome, using the page's own heading and the self-hosted fonts. Run it after adding or renaming a page:

```sh
node scripts/og/render.mjs            # all pages
node scripts/og/render.mjs void guides  # only these slugs
```

## Local development

```sh
npx serve .
```

`serve` resolves clean URLs on its own (`/guides` → `guides.html`). The redirects, the `/void` content negotiation and the headers from `vercel.json` only apply on Vercel.

## Deployment

Vercel builds and deploys every push to `master`. There is no build command; the repository root is served as-is with the rules from `vercel.json`.
