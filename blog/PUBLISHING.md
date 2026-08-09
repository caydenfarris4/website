# Publishing a new blog post

Checklist for every new post. Follow all steps — several site features
(link previews, sorting, navigation) depend on them.

## 1. Write the markdown file

Create `blog/<track>/posts/<slug>.md` where `<track>` is `the-work` or
`ancient-paths` and `<slug>` is lowercase-hyphenated (letters, digits,
hyphens only — the reader rejects anything else).

Frontmatter template:

```yaml
---
title: "Post Title"
subtitle: "One-sentence thesis shown under the title."
excerpt: "The hook. 1-3 short sentences. See the share rules below."
volume: "Vol. N"          # next number in the track
readtime: 6               # minutes, integer
date: "August 9, 2026"    # written-out format
key_principle: "One-line principle shown in the highlighted band. (The Work only)"
reflection:
  - question: "Four reflection questions..."
  - question: "..."
  - question: "..."
  - question: "..."
next_title: "Title of a related post"
next_slug: "slug-of-that-post"
---
```

**Share previews (important):** when a post link is shared (Instagram
story, iMessage, X, Facebook, LinkedIn), the preview is generated
server-side by `worker.js` from two frontmatter fields:

- `title` → the preview headline
- `excerpt` → the preview one-liner (falls back to `subtitle` if absent)

So the `excerpt` must read as a standalone hook, ideally under ~200
characters for clean truncation. Do not use double quotes inside
frontmatter values (the parsers are line-based); apostrophes are fine.
Nothing else is needed — the worker picks up new posts automatically.

**Voice notes (The Work):** cold open on a concrete scene, first line as
its own paragraph; short paragraphs with one-line punches; quote an
authority then reframe the common reading; `---` between sections;
sentence-style `##` headings; close by pivoting from "I" to "you."

## 2. Chain the navigation

Add `next_title`/`next_slug` to the previous newest post in the track so
it links forward to the new post (most recent posts otherwise dead-end).

## 3. Add the card to /blog/index.html

Copy an existing `<a class="post-card ...">` block. Set:

- `href="/blog/<track>/reader.html?post=<slug>"`
- `class` track modifier: `work` or `ancient`
- `data-track`: `work` or `ancient`
- `data-date`: ISO format `YYYY-MM-DD` — **this controls sorting**; the
  index shows newest-first by default using this value
- `data-order`: next integer (used by the "Original" sort toggle)
- Card text: title (with `<em>` on part of it), the excerpt, and the
  date in `Mon D, YYYY` format
- Share button: `sharePost(event,'<post path>','<Title>')`
- Update the static post count in `<span id="postsCount">`

Placement in the HTML doesn't affect the default view (JS sorts by date
on load) — append at the end with the other cards.

## 4. Add the sitemap entry

Add to `sitemap.xml`:
`<url><loc>https://caydenfarris.net/blog/<track>/reader.html?post=<slug></loc></url>`

## 5. Verify before merging

- Load `/blog/<track>/reader.html?post=<slug>` — title, subtitle,
  key-principle band, reflection box, and next-post link all render
- `curl -s '<url>' | grep og:` on a deployed preview — the og:title and
  og:description must show the post's title and excerpt
- Card appears first on `/blog/` (newest-first default)
