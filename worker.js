// Injects per-post Open Graph / Twitter tags into the blog reader pages so
// shared links unfurl with the post's own title and excerpt. Social scrapers
// (Instagram, iMessage, Facebook, X, LinkedIn) never execute JavaScript, so
// the client-side reader can't do this — it has to happen at the edge.
//
// Only /blog/<track>/reader.html requests run through this worker (see
// run_worker_first in wrangler.jsonc); every other asset is served directly.

const TRACKS = {
  'the-work': 'The Work',
  'ancient-paths': 'Ancient Paths',
};

// Pulls a single scalar field out of the post's YAML frontmatter.
function fmField(fm, key) {
  const m = fm.match(new RegExp('^' + key + ':\\s*"?(.*?)"?\\s*$', 'm'));
  return m ? m[1].trim() : '';
}

const setContent = (value) => ({
  element(el) { el.setAttribute('content', value); },
});

export default {
  async fetch(request, env) {
    try {
      return await injectPostTags(request, env);
    } catch {
      // Never let tag injection take a page down — serve it untouched.
      return env.ASSETS.fetch(request);
    }
  },
};

async function injectPostTags(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/blog\/(the-work|ancient-paths)\/reader\.html$/);
    const slug = url.searchParams.get('post') || '';

    if (!match || !/^[a-zA-Z0-9_-]{1,120}$/.test(slug)) {
      return env.ASSETS.fetch(request);
    }

    const track = match[1];
    const [page, mdRes] = await Promise.all([
      env.ASSETS.fetch(new URL(`/blog/${track}/reader.html`, url.origin)),
      env.ASSETS.fetch(new URL(`/blog/${track}/posts/${slug}.md`, url.origin)),
    ]);
    if (!mdRes.ok) return page;

    // Frontmatter is everything before the closing fence.
    const frontmatter = (await mdRes.text()).split('\n---')[0];
    const title = fmField(frontmatter, 'title');
    const description = fmField(frontmatter, 'excerpt') || fmField(frontmatter, 'subtitle');
    if (!title) return page;

    const fullTitle = `${title} — ${TRACKS[track]} · Cayden Farris`;
    const canonical = `https://caydenfarris.net/blog/${track}/reader.html?post=${encodeURIComponent(slug)}`;

    let rewriter = new HTMLRewriter()
      .on('title', { element(el) { el.setInnerContent(fullTitle); } })
      .on('meta[property="og:title"]', setContent(title))
      .on('meta[property="og:url"]', setContent(canonical))
      .on('meta[name="twitter:title"]', setContent(title))
      .on('link[rel="canonical"]', { element(el) { el.setAttribute('href', canonical); } });

    if (description) {
      rewriter = rewriter
        .on('meta[name="description"]', setContent(description))
        .on('meta[property="og:description"]', setContent(description))
        .on('meta[name="twitter:description"]', setContent(description));
    }

    return rewriter.transform(page);
}
