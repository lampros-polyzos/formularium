import { describe, expect, it } from 'vitest';
import { ARTICLES } from '../content/articles';
import { blocksHtml, escapeHtml, inlineHtml } from './html';
import { cleanOrigin, headFor, headHtml, safeJson } from './head';
import { pageFor, publicPages, shorten, titleTag } from './pages';
import { llmsTxt, robotsWithSitemap, sitemapXml } from './site';

const ORIGIN = 'https://formularium.example';

describe('public pages', () => {
    const pages = publicPages();

    it('lists the home page, blog, every article, learn, calculators and the two legal pages, each once', () => {
        const paths = pages.map(p => p.path);
        expect(new Set(paths).size).toBe(paths.length);
        expect(paths).toEqual(expect.arrayContaining(['/', '/blog', '/learn', '/tools', '/privacy', '/terms', ...ARTICLES.map(a => `/blog/${a.slug}`)]));
        expect(paths.length).toBe(6 + ARTICLES.length);
    });

    it('gives every page its own title and a description that fits a search result', () => {
        expect(new Set(pages.map(p => titleTag(p.title))).size, 'titles are unique').toBe(pages.length);
        expect(new Set(pages.map(p => p.description)).size, 'descriptions are unique').toBe(pages.length);
        for (const p of pages) {
            expect(titleTag(p.title).length, `${p.path} title`).toBeLessThanOrEqual(75);   // longer titles get cut off in search results
            expect(p.description.length, `${p.path} description`).toBeGreaterThanOrEqual(60);
            expect(p.description.length, `${p.path} description`).toBeLessThanOrEqual(160);
        }
    });

    it('puts a readable copy of the content in the page, with one main heading and links to the rest of the site', () => {
        for (const p of pages) {
            expect(p.html.match(/<h1[ >]/g)?.length, `${p.path} has one h1`).toBe(1);
            expect(p.html, p.path).toContain('href="/blog"');
        }
        const article = pageFor(`/blog/${ARTICLES[0].slug}`)!;
        expect(article.html).toContain('Key takeaways');
        expect(article.html).toContain(escapeHtml(ARTICLES[0].title));
    });

    it('uses only addresses that exist in the links inside the content', () => {
        const known = new Set([...pages.map(p => p.path), '/studio/new', '/library', '/stash', '/community']);   // the app pages that guides send readers to
        for (const p of pages) {
            for (const m of p.html.matchAll(/href="(\/[^"?#]*)/g)) expect(known.has(m[1]), `${p.path} -> ${m[1]}`).toBe(true);
        }
    });

    it('describes articles as Article with dates, and adds breadcrumbs', () => {
        const [article, crumbs] = pageFor(`/blog/${ARTICLES[0].slug}`)!.jsonLd(ORIGIN) as Record<string, unknown>[];
        expect(article).toMatchObject({ '@type': 'Article', headline: ARTICLES[0].title, datePublished: ARTICLES[0].publishedAt, mainEntityOfPage: `${ORIGIN}/blog/${ARTICLES[0].slug}` });
        expect(crumbs['@type']).toBe('BreadcrumbList');
        expect((crumbs.itemListElement as unknown[]).length).toBe(3);
    });

    it('marks up the questions on the learn page as an FAQ', () => {
        const faq = pageFor('/learn')!.jsonLd(ORIGIN)[0] as { '@type': string; mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
        expect(faq['@type']).toBe('FAQPage');
        expect(faq.mainEntity.length).toBeGreaterThan(3);
        expect(faq.mainEntity.every(q => q.name && q.acceptedAnswer.text && !q.acceptedAnswer.text.includes('**'))).toBe(true);
    });
});

describe('titles and descriptions', () => {
    it('names the site in titles that have room for it, and gives the home page a descriptive one', () => {
        expect(titleTag('Blog')).toBe('Blog | Formularium');
        expect(titleTag('Formularium')).toMatch(/^Formularium: /);
        expect(titleTag('A very long article title that would be cut off in the search results')).not.toContain('Formularium');
    });

    it('cuts a long description at a word, with an ellipsis, and strips the markup', () => {
        const cut = shorten(`Start **here** with [this guide](/blog/x). ${'word '.repeat(60)}`);
        expect(cut.length).toBeLessThanOrEqual(158);
        expect(cut.endsWith('…')).toBe(true);
        expect(cut).not.toMatch(/\*\*|\]\(/);
        expect(shorten('Short and sweet.')).toBe('Short and sweet.');
    });
});

describe('head tags', () => {
    const page = pageFor(`/blog/${ARTICLES[0].slug}`)!;

    it('includes the canonical address, social tags, article dates and structured data when the site address is known', () => {
        const head = headFor(page, `${ORIGIN}/`);
        expect(head.links).toEqual([{ rel: 'canonical', href: `${ORIGIN}${page.path}` }]);
        const metas = Object.fromEntries(head.metas.map(m => [m.key, m.content]));
        expect(metas['og:url']).toBe(`${ORIGIN}${page.path}`);
        expect(metas['og:type']).toBe('article');
        expect(metas['article:published_time']).toBe(ARTICLES[0].publishedAt);
        expect(metas['twitter:title']).toBe(head.title);
        expect(head.jsonLd.length).toBeGreaterThan(0);
    });

    it('leaves out what needs an absolute address instead of guessing one', () => {
        const head = headFor(page, '');
        expect(head.links).toEqual([]);
        expect(head.jsonLd).toEqual([]);
        expect(head.metas.some(m => m.key === 'og:url')).toBe(false);
        expect(head.metas.find(m => m.key === 'description')?.content).toBe(page.description);
    });

    it('asks search engines to skip a page when told to', () => {
        expect(headFor(page, ORIGIN, { noindex: true }).metas).toContainEqual({ attr: 'name', key: 'robots', content: 'noindex, follow' });
    });

    it('escapes everything it prints, and cannot be broken out of a script tag', () => {
        const html = headHtml(headFor({ ...page, title: 'A "quoted" <b>title</b>', description: `Tom & Jerry's "show"` }, ORIGIN));
        expect(html).toContain('A &quot;quoted&quot; &lt;b&gt;title&lt;/b&gt;');
        expect(html).not.toContain('<b>');
        expect(safeJson({ x: '</script><script>alert(1)</script>' })).not.toContain('</script>');
        expect(cleanOrigin(' https://a.example/// ')).toBe('https://a.example');
    });
});

describe('content as HTML', () => {
    it('escapes text, keeps links and bold, and makes tables', () => {
        expect(inlineHtml('a <script> & **bold** and [a link](/blog)')).toBe('a &lt;script&gt; &amp; <strong>bold</strong> and <a href="/blog">a link</a>');
        const html = blocksHtml([{ type: 'table', headers: ['A'], rows: [['1']] }, { type: 'ul', items: ['x'] }, { type: 'h2', text: 'Why pH matters' }]);
        expect(html).toContain('<th>A</th>');
        expect(html).toContain('<td>1</td>');
        expect(html).toContain('<h2 id="why-ph-matters">');
    });
});

describe('site files', () => {
    it('lists every public page in the sitemap, with the date it last changed', () => {
        const xml = sitemapXml(ORIGIN);
        expect(xml.match(/<loc>/g)?.length).toBe(publicPages().length);
        expect(xml).toContain(`<loc>${ORIGIN}/blog/${ARTICLES[0].slug}</loc><lastmod>${ARTICLES[0].publishedAt}</lastmod>`);
        expect(xml).toContain(`<loc>${ORIGIN}/</loc>`);
    });

    it('does not put private app pages in the sitemap or llms.txt', () => {
        for (const text of [sitemapXml(ORIGIN), llmsTxt(ORIGIN)]) expect(text).not.toMatch(/\/(studio|stash|batches|community|library|metrics)/);
    });

    it('writes llms.txt with a summary and a link and one line for every article', () => {
        const txt = llmsTxt(ORIGIN);
        expect(txt.startsWith('# Formularium\n\n> ')).toBe(true);
        for (const a of ARTICLES) expect(txt).toContain(`[${a.title}](${ORIGIN}/blog/${a.slug}): ${a.excerpt}`);
    });

    it('adds the sitemap to robots.txt once, as an absolute address', () => {
        const once = robotsWithSitemap('User-agent: *\nAllow: /\n', ORIGIN);
        expect(once).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
        expect(robotsWithSitemap(once, ORIGIN).match(/Sitemap:/g)).toHaveLength(1);
    });
});
