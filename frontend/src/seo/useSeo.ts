import { useEffect } from 'react';
import { cleanOrigin, headFor, safeJson, type HeadModel } from './head.ts';
import { pageFor } from './pages.ts';

/** The public address of the site: set VITE_SITE_URL for the real one; otherwise the address the page is being served from. */
export function siteOrigin(): string {
    const configured = cleanOrigin(import.meta.env.VITE_SITE_URL as string | undefined);
    return configured || (typeof window === 'undefined' ? '' : window.location.origin);
}

const META = (attr: string, key: string) => `meta[${attr}="${key}"]`;

/** Applies the head tags to the live document and returns a function that puts everything back as it was. */
export function applyHead(head: HeadModel): () => void {
    const undo: (() => void)[] = [];

    const previousTitle = document.title;
    document.title = head.title;
    undo.push(() => { document.title = previousTitle; });

    for (const m of head.metas) {
        let el = document.head.querySelector<HTMLMetaElement>(META(m.attr, m.key));
        const created = !el;
        const before = el?.content;
        if (!el) { el = document.createElement('meta'); el.setAttribute(m.attr, m.key); document.head.appendChild(el); }
        el.content = m.content;
        const node = el;
        undo.push(() => { if (created) node.remove(); else node.content = before ?? ''; });
    }
    for (const l of head.links) {
        let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${l.rel}"]`);
        const created = !el;
        const before = el?.href;
        if (!el) { el = document.createElement('link'); el.rel = l.rel; document.head.appendChild(el); }
        el.href = l.href;
        const node = el;
        undo.push(() => { if (created) node.remove(); else node.href = before ?? ''; });
    }
    // The pre-built page may already carry structured data for this page: swap it for the live one and put it back after
    const staticLd = [...document.head.querySelectorAll('script[type="application/ld+json"]')];
    staticLd.forEach(el => el.remove());
    const added = head.jsonLd.map(d => {
        const el = document.createElement('script');
        el.type = 'application/ld+json';
        el.textContent = safeJson(d);
        document.head.appendChild(el);
        return el;
    });
    undo.push(() => { added.forEach(el => el.remove()); staticLd.forEach(el => document.head.appendChild(el)); });

    return () => undo.reverse().forEach(fn => fn());
}

/**
 * Sets the title, description, canonical address, social tags and structured data for a public page while it is shown.
 * Pass `noindex` for pages that should stay out of search results, such as an article that was not found.
 */
export function useSeo(path: string, options: { noindex?: boolean; title?: string } = {}) {
    const { noindex, title } = options;
    useEffect(() => {
        const page = pageFor(path);
        if (!page) {
            if (!title) return;
            return applyHead({ title, metas: [{ attr: 'name', key: 'robots', content: 'noindex, follow' }], links: [], jsonLd: [] });
        }
        return applyHead(headFor(title ? { ...page, title } : page, siteOrigin(), { noindex }));
    }, [path, noindex, title]);
}
