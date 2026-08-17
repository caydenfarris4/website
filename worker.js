// Edge worker for caydenfarris.net. Three jobs:
//
// 1. Pre-render blog posts as full HTML at /blog/<track>/<slug>/ so the
//    article text is in the served response. AI crawlers (GPTBot, ClaudeBot,
//    PerplexityBot, Bingbot) never execute JavaScript, so the old client-side
//    reader was invisible to them — and to most link scrapers. The reader
//    page is used as the template; the markdown is rendered here at the edge.
// 2. 301 the old query-string URLs (/blog/<track>/reader.html?post=<slug>)
//    to the new static paths so existing shared links keep working.
// 3. /go/* tracked redirects to Amazon. Every book link on the site routes
//    through these paths so clicks are countable (each /go/* request in
//    analytics = one click) and so the destinations can be swapped for
//    Amazon Attribution tagged URLs in ONE place without touching page HTML.
//
// Only /blog/<track>/* and /go/* run through this worker (see
// run_worker_first in wrangler.jsonc); everything else is served as static
// assets.

const TRACKS = {
  'the-work': 'The Work',
  'ancient-paths': 'Ancient Paths',
};

const SLUG_RE = /^[a-zA-Z0-9_-]{1,120}$/;

// ── /go/* REDIRECT MAP ──────────────────────────────────────────────────────
// One entry per placement. TO ACTIVATE AMAZON ATTRIBUTION: create one
// Attribution tag per placement in the Amazon Ads dashboard (Measurement &
// Reporting → Amazon Attribution) and replace the values below with the
// tagged URLs. Until then everything 302s to the canonical product page.
// 302 (not 301) on purpose: browsers don't permanently cache it, so swapped
// tags take effect immediately.
const CANONICAL_AMAZON = 'https://www.amazon.com/dp/B0H76DT3DM';
const GO_LINKS = {
  'book-home':   CANONICAL_AMAZON, // homepage book section
  'book-page':   CANONICAL_AMAZON, // /book page buy buttons
  'book-blog':   CANONICAL_AMAZON, // blog post footers (The Work track)
  'book-social': CANONICAL_AMAZON, // for social bios — use caydenfarris.net/go/book-social
  'book-email':  CANONICAL_AMAZON, // for email footers
};

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch {
      // Never let rendering take a page down — serve the asset untouched.
      return env.ASSETS.fetch(request);
    }
  },
};

async function route(request, env) {
  const url = new URL(request.url);

  // ── /go/* tracked Amazon redirects ──
  const go = url.pathname.match(/^\/go\/([a-z0-9-]{1,60})\/?$/);
  if (go) {
    const dest = GO_LINKS[go[1]];
    if (dest) {
      return new Response(null, {
        status: 302,
        headers: { Location: dest, 'Cache-Control': 'no-store' },
      });
    }
    return env.ASSETS.fetch(request); // unknown tag → 404 via assets
  }

  // ── Legacy reader URLs → 301 to static post paths ──
  // Matches both reader.html and the extensionless /reader variant that
  // html_handling's canonicalization redirect can produce.
  const reader = url.pathname.match(/^\/blog\/(the-work|ancient-paths)\/reader(?:\.html)?$/);
  if (reader) {
    const slug = url.searchParams.get('post') || '';
    if (SLUG_RE.test(slug)) {
      return Response.redirect(`${url.origin}/blog/${reader[1]}/${slug}/`, 301);
    }
    // No/invalid slug: nothing to show — send to the blog index.
    return Response.redirect(`${url.origin}/blog/`, 301);
  }

  // ── Static post paths → pre-rendered article HTML ──
  const post = url.pathname.match(/^\/blog\/(the-work|ancient-paths)\/([a-zA-Z0-9_-]{1,120})\/?$/);
  if (post && post[2] !== 'posts' && post[2] !== 'reader') {
    const page = await renderPost(url, post[1], post[2], env);
    if (page) return page;
    // Unknown slug → fall through so assets return their 404.
  }

  return env.ASSETS.fetch(request);
}

// ── PRE-RENDER ──────────────────────────────────────────────────────────────

async function renderPost(url, track, slug, env) {
  const [pageRes, mdRes] = await Promise.all([
    env.ASSETS.fetch(new URL(`/blog/${track}/reader.html`, url.origin)),
    env.ASSETS.fetch(new URL(`/blog/${track}/posts/${slug}.md`, url.origin)),
  ]);
  if (!mdRes.ok || !pageRes.ok) return null;

  const raw = await mdRes.text();
  const { fm, body } = parseFrontmatter(raw);
  if (!fm.title) return null;

  const trackName = TRACKS[track];
  const canonical = `https://caydenfarris.net/blog/${track}/${slug}/`;
  const fullTitle = `${fm.title} — ${trackName} · Cayden Farris`;
  const description = fm.excerpt || fm.subtitle || '';
  const bodyHtml = renderMarkdown(body);

  const setContent = (value) => ({
    element(el) { el.setAttribute('content', value); },
  });
  const setText = (value) => ({
    element(el) { el.setInnerContent(value); },
  });
  const show = { element(el) { el.setAttribute('style', 'display:block'); } };
  const hide = { element(el) { el.setAttribute('style', 'display:none') ; } };

  // JSON-LD so search engines see this as an article with an author.
  const published = fm.date ? new Date(fm.date) : null;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: fm.title,
    description,
    url: canonical,
    author: { '@type': 'Person', name: 'Cayden Farris', url: 'https://caydenfarris.net/' },
    ...(published && !isNaN(published) ? { datePublished: published.toISOString().slice(0, 10) } : {}),
  };

  let rw = new HTMLRewriter()
    .on('title', setText(fullTitle))
    .on('meta[name="description"]', setContent(description))
    .on('meta[property="og:title"]', setContent(fm.title))
    .on('meta[property="og:description"]', setContent(description))
    .on('meta[property="og:url"]', setContent(canonical))
    .on('meta[name="twitter:title"]', setContent(fm.title))
    .on('meta[name="twitter:description"]', setContent(description))
    .on('link[rel="canonical"]', { element(el) { el.setAttribute('href', canonical); } })
    .on('head', {
      element(el) {
        el.append(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`, { html: true });
      },
    })
    // Tell the client script the article is already rendered.
    .on('body', { element(el) { el.setAttribute('data-prerendered', 'true'); } })
    .on('#loading', hide)
    .on('#article', show)
    .on('#postTitle', setText(fm.title))
    .on('#postVolume', setText(`${trackName} · ${fm.volume || ''}`))
    .on('#postReadtime', setText(`${fm.readtime || '?'} min read`))
    .on('#postContent', { element(el) { el.setInnerContent(bodyHtml, { html: true }); } });

  rw = fm.subtitle
    ? rw.on('#postSubtitle', setText(fm.subtitle))
    : rw.on('#postSubtitle', hide);

  // The Work: key-principle band
  if (fm.key_principle) {
    rw = rw.on('#blueprintBand', show)
           .on('#keyPrinciple', setText(`"${fm.key_principle}"`));
  }

  // Ancient Paths: Hebrew word hero
  if (fm.hebrew && fm.hebrew.chars) {
    rw = rw.on('#hebrewHero', show)
           .on('#hebrewChars', setText(fm.hebrew.chars))
           .on('#hebrewTranslit', setText(fm.hebrew.translit || ''))
           .on('#hebrewDef', setText(fm.hebrew.definition || ''));
  }

  if (Array.isArray(fm.reflection) && fm.reflection.length > 0) {
    const items = fm.reflection.map((q) => `<li>${escapeHtml(q)}</li>`).join('');
    rw = rw.on('#reflectionBox', show)
           .on('#reflectionList', { element(el) { el.setInnerContent(items, { html: true }); } });
  }

  if (fm.next_title && fm.next_slug && SLUG_RE.test(fm.next_slug)) {
    const next = `<a href="/blog/${track}/${fm.next_slug}/" class="article-nav-link" style="text-align:right">` +
      `<div class="nav-dir">Next in ${trackName} →</div>` +
      `<div class="nav-title">${escapeHtml(fm.next_title)}</div></a>`;
    rw = rw.on('#nextPostLink', { element(el) { el.setInnerContent(next, { html: true }); } });
  }

  return rw.transform(pageRes);
}

// ── FRONTMATTER ─────────────────────────────────────────────────────────────
// Same line-based format the client parser handles: scalars, `reflection:`
// question lists, and the nested `hebrew:` object.

function parseFrontmatter(raw) {
  const normalized = raw.replace(/\r\n?/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { fm: {}, body: normalized };

  const fm = {};
  const lines = match[1].split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }

    // List block (e.g. reflection:)
    if (line.match(/^(\w+):\s*$/) && lines[i + 1] && lines[i + 1].match(/^\s+-/)) {
      const key = line.match(/^(\w+):/)[1];
      const items = [];
      i++;
      while (i < lines.length && lines[i].match(/^\s+-/)) {
        const itemLine = lines[i].trim().replace(/^-\s*/, '');
        const qMatch = itemLine.match(/^question:\s*"?(.+?)"?\s*$/);
        items.push(qMatch ? qMatch[1] : itemLine.replace(/^"(.*)"$/, '$1'));
        i++;
      }
      fm[key] = items;
      continue;
    }

    // Nested object block (e.g. hebrew:)
    if (line.match(/^(\w+):\s*$/) && lines[i + 1] && lines[i + 1].match(/^\s+\w+:/)) {
      const key = line.match(/^(\w+):/)[1];
      const obj = {};
      i++;
      while (i < lines.length && lines[i].match(/^\s+\w+:/)) {
        const sub = lines[i].trim().match(/^(\w+):\s*"?([\s\S]*?)"?\s*$/);
        if (sub) obj[sub[1]] = sub[2];
        i++;
      }
      fm[key] = obj;
      continue;
    }

    const boolMatch = line.match(/^(\w+):\s*(true|false)\s*$/);
    const numMatch = line.match(/^(\w+):\s*(\d+)\s*$/);
    const simpleMatch = line.match(/^(\w+):\s*"?(.*?)"?\s*$/);
    if (boolMatch) { fm[boolMatch[1]] = boolMatch[2] === 'true'; }
    else if (numMatch) { fm[numMatch[1]] = parseInt(numMatch[2]); }
    else if (simpleMatch) { fm[simpleMatch[1]] = simpleMatch[2]; }
    i++;
  }

  return { fm, body: match[2] };
}

// ── MARKDOWN ────────────────────────────────────────────────────────────────
// Small renderer covering exactly what the posts use (see blog/PUBLISHING.md):
// ##/### headings, ---, > blockquotes, -/1. lists, images, links, bold,
// italics, paragraphs. Everything is HTML-escaped first, so post text can
// never inject markup.

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeHref(href) {
  return /^(https?:\/\/|\/|#|mailto:)/.test(href) ? href : '#';
}

function inline(text) {
  let s = escapeHtml(text);
  // images before links (shared bracket syntax)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) =>
    `<img src="${safeHref(src)}" alt="${alt}" loading="lazy" decoding="async" style="max-width:100%;border-radius:3px">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) =>
    `<a href="${safeHref(href)}">${label}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/(^|\s)_([^_]+)_(?=\s|[.,;:!?]|$)/g, '$1<em>$2</em>');
  return s;
}

function renderMarkdown(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  let quote = [];
  let list = null; // { tag: 'ul'|'ol', items: [] }

  const flushPara = () => {
    if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
  };
  const flushQuote = () => {
    if (quote.length) { out.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`); quote = []; }
  };
  const flushList = () => {
    if (list) {
      out.push(`<${list.tag}>${list.items.map((it) => `<li>${inline(it)}</li>`).join('')}</${list.tag}>`);
      list = null;
    }
  };
  const flushAll = () => { flushPara(); flushQuote(); flushList(); };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const t = line.trim();

    if (!t) { flushAll(); continue; }

    if (/^-{3,}$/.test(t)) { flushAll(); out.push('<hr>'); continue; }

    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushAll();
      const level = Math.min(Math.max(h[1].length, 2), 3); // posts use ##/###
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }

    if (t.startsWith('>')) {
      flushPara(); flushList();
      quote.push(t.replace(/^>\s?/, ''));
      continue;
    }

    const ul = t.match(/^[-*]\s+(.*)$/);
    const ol = t.match(/^\d+\.\s+(.*)$/);
    if (ul || ol) {
      flushPara(); flushQuote();
      const tag = ul ? 'ul' : 'ol';
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push((ul || ol)[1]);
      continue;
    }

    // Standalone image line renders as its own block
    if (/^!\[[^\]]*\]\([^)]+\)$/.test(t)) {
      flushAll();
      out.push(`<p>${inline(t)}</p>`);
      continue;
    }

    flushQuote(); flushList();
    para.push(t);
  }
  flushAll();
  return out.join('\n');
}
