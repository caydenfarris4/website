# caydenfarris.net

Static personal site (author/speaker/coach) served as Cloudflare Worker
static assets. No build step — plain HTML/CSS/JS, each page self-contained
with inline styles. Fonts: Cormorant Garamond (headings) + Lora (body).
Palette: cream `#faf6ef`, gold `#b8840a`, espresso `#1c1208` (see any
page's `:root`).

## Layout

- `index.html` — homepage (hero, about, book, Foreman.coach, work grid,
  speaking, resume, contact)
- `book/` — *Under Construction* book page (out now)
- `blog/` — index with filterable post cards; two tracks, each with a
  client-side markdown reader:
  - `blog/the-work/` — leadership essays
  - `blog/ancient-paths/` — scripture study
  - Posts are markdown files in `blog/<track>/posts/<slug>.md`
- `tabernacle/`, `high-priest/`, `levitical-sacrifices/` — interactive
  study tools
- `worker.js` — Cloudflare Worker that injects per-post Open Graph tags
  into the blog readers (social scrapers don't run JS); only the two
  reader paths run through it (`run_worker_first` in `wrangler.jsonc`)
- `images/og/` — branded 1200×630 share images per track

## Publishing a blog post

Follow `blog/PUBLISHING.md` exactly — frontmatter drives the reader UI
AND the share previews (`title` + `excerpt` become the link unfurl).
Steps: markdown file → next-post chain → index card (+ post count) →
sitemap entry → verify.

## Conventions

- Deploys: Cloudflare Workers Builds runs `npx wrangler versions upload`
  on push; production deploys from `main`
- Forms post to Formspree (see existing forms for the pattern)
- Foreman.coach (the coaching app) links use `https://foreman.coach`
- Book purchase links use the canonical Amazon URL `https://www.amazon.com/dp/B0H76DT3DM`
  (never the long search-result URLs with tracking parameters)
- Keep new UI in the existing design language; match inline-CSS style of
  the page being edited
- Pages style `nav` by ELEMENT selector (fixed top bar) — never add a
  second `<nav>` element to a page; use `<div role="navigation">`
- The homepage hero book uses `mix-blend-mode: multiply` to sink its
  white background into the cream page — no ancestor of `.hero-book img`
  may create a stacking context (no transform/opacity/z-index/filter)
  or the white box comes back
- `design-reference/DESIGN.md` is an external reference (Anthropic's
  design analysis) for quality inspiration only — this site's own
  palette/type always wins (see design-reference/README.md)
