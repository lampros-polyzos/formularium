import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ARTICLES } from '../content/articles';
import { renderPage } from './prerender';
import { pageFor } from './pages';
import { useSeo } from './useSeo';

function Page({ path, noindex, title }: { path: string; noindex?: boolean; title?: string }) {
    useSeo(path, { noindex, title });
    return null;
}
const meta = (key: string) => document.head.querySelector<HTMLMetaElement>(`meta[name="${key}"], meta[property="${key}"]`)?.content;

beforeEach(() => {
    document.head.innerHTML = '<title>Formularium: Precision formulating for the home lab</title><meta name="description" content="default description" />';
});
afterEach(cleanup);

describe('useSeo', () => {
    const slug = ARTICLES[0].slug;

    it('sets the title, description, canonical address, social tags and structured data for the page shown', () => {
        render(<Page path={`/blog/${slug}`} />);
        expect(document.title).toContain(ARTICLES[0].title);
        expect(meta('description')).toBe(pageFor(`/blog/${slug}`)!.description);
        expect(meta('og:type')).toBe('article');
        expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${window.location.origin}/blog/${slug}`);
        const ld = [...document.head.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent!)['@type']);
        expect(ld).toEqual(['Article', 'BreadcrumbList']);
    });

    it('puts everything back when the page is left, so the next page does not inherit it', () => {
        const { unmount } = render(<Page path={`/blog/${slug}`} />);
        unmount();
        expect(document.title).toBe('Formularium: Precision formulating for the home lab');
        expect(meta('description')).toBe('default description');
        expect(meta('og:type')).toBeUndefined();
        expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
        expect(document.head.querySelector('script[type="application/ld+json"]')).toBeNull();
    });

    it('replaces the structured data of a pre-built page instead of doubling it, and restores it on leaving', () => {
        document.head.insertAdjacentHTML('beforeend', '<script type="application/ld+json">{"@type":"Built"}</script>');
        const { unmount } = render(<Page path="/blog" />);
        expect([...document.head.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent!)['@type'])).toEqual(['CollectionPage', 'BreadcrumbList']);
        unmount();
        expect([...document.head.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent!)['@type'])).toEqual(['Built']);
    });

    it('keeps an article that was not found out of search results', () => {
        render(<Page path="/blog/nope" noindex title="Article not found" />);
        expect(document.title).toBe('Article not found');
        expect(meta('robots')).toBe('noindex, follow');
    });

    it('can ask search engines to skip a real page', () => {
        render(<Page path="/blog" noindex />);
        expect(meta('robots')).toBe('noindex, follow');
    });
});

describe('the pre-built page', () => {
    const template = '<html><head>\n    <!-- seo:start -->\n    <title>x</title>\n    <!-- seo:end -->\n  </head><body><div id="root"></div></body></html>';

    it('swaps in the tags and the readable content of the page, once', () => {
        const page = pageFor(`/blog/${ARTICLES[0].slug}`)!;
        const html = renderPage(template, page, 'https://formularium.example');
        expect(html.match(/<title>/g)).toHaveLength(1);
        expect(html).toContain(`<link rel="canonical" href="https://formularium.example${page.path}" />`);
        expect(html).toContain('application/ld+json');
        expect(html).toContain(`<div id="root"><div class="seo-static"><nav`);
        expect(html).toContain(ARTICLES[0].takeaways[0].replace(/\*\*/g, '').slice(0, 20));
        expect(html).not.toContain('<div id="root"></div>');
    });

    it('styles only its own wrapper, never the page: that style stays in place once the app is running', () => {
        const html = renderPage(template, pageFor('/blog')!, '');
        const style = html.match(/<style>([^<]*)<\/style>/)![1];
        const selectors = style.split('}').map(rule => rule.split('{')[0].trim()).filter(Boolean);
        expect(selectors.length).toBeGreaterThan(0);
        for (const selector of selectors.flatMap(s => s.split(','))) {
            expect(selector.trim()).toMatch(/^\.seo-static(\s|$)/);   // not body, html, table, a ... on their own
        }
    });

    it('leaves the canonical address and structured data out when the site address is not set', () => {
        const html = renderPage(template, pageFor('/blog')!, '');
        expect(html).not.toContain('rel="canonical"');
        expect(html).not.toContain('application/ld+json');
        expect(html).toContain('name="description"');
    });
});
