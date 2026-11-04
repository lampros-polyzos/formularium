// The <head> tags for a page, as data. The build step turns them into HTML and the app applies them while navigating.

import { SITE_NAME, titleTag, type PageSeo } from './pages.ts';
import { escapeHtml } from './html.ts';

export interface HeadModel {
    title: string;
    /** <meta> tags: `name` or `property` (Open Graph) plus the content */
    metas: { attr: 'name' | 'property'; key: string; content: string }[];
    links: { rel: string; href: string }[];
    jsonLd: object[];
}

/** Removes a trailing slash so addresses can be joined with a path that starts with "/" */
export const cleanOrigin = (origin: string | undefined): string => (origin ?? '').trim().replace(/\/+$/, '');

/**
 * `origin` is the public address of the site (for example https://formularium.example). Without one only the tags that do not
 * need an absolute address are made: the canonical link, Open Graph url and structured data are left out rather than guessed.
 */
export function headFor(page: PageSeo, origin?: string, options: { noindex?: boolean } = {}): HeadModel {
    const site = cleanOrigin(origin);
    const title = titleTag(page.title);
    const metas: HeadModel['metas'] = [
        { attr: 'name', key: 'description', content: page.description },
        { attr: 'property', key: 'og:site_name', content: SITE_NAME },
        { attr: 'property', key: 'og:locale', content: 'en_US' },
        { attr: 'property', key: 'og:type', content: page.kind },
        { attr: 'property', key: 'og:title', content: title },
        { attr: 'property', key: 'og:description', content: page.description },
        { attr: 'name', key: 'twitter:card', content: 'summary' },
        { attr: 'name', key: 'twitter:title', content: title },
        { attr: 'name', key: 'twitter:description', content: page.description },
    ];
    if (options.noindex) metas.push({ attr: 'name', key: 'robots', content: 'noindex, follow' });
    if (page.kind === 'article' && page.publishedAt) {
        metas.push({ attr: 'property', key: 'article:published_time', content: page.publishedAt });
        metas.push({ attr: 'property', key: 'article:modified_time', content: page.modifiedAt ?? page.publishedAt });
    }
    const links: HeadModel['links'] = [];
    if (site) {
        links.push({ rel: 'canonical', href: `${site}${page.path}` });
        metas.push({ attr: 'property', key: 'og:url', content: `${site}${page.path}` });
    }
    return { title, metas, links, jsonLd: site ? page.jsonLd(site) : [] };
}

/** JSON inside a <script> must not be able to close the tag */
export const safeJson = (data: object): string => JSON.stringify(data).replace(/</g, '\\u003c');

export function headHtml(head: HeadModel): string {
    return [
        `<title>${escapeHtml(head.title)}</title>`,
        ...head.metas.map(m => `<meta ${m.attr}="${m.key}" content="${escapeHtml(m.content)}" />`),
        ...head.links.map(l => `<link rel="${l.rel}" href="${escapeHtml(l.href)}" />`),
        ...head.jsonLd.map(d => `<script type="application/ld+json">${safeJson(d)}</script>`),
    ].join('\n    ');
}
