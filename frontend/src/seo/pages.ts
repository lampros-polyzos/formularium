// Everything search engines and AI assistants should know about each public page: title, description, canonical address,
// structured data (JSON-LD) and a crawlable HTML version of the content. Pure data, shared by the build step and the app.

import { ARTICLES } from '../content/articles.ts';
import type { Article } from '../content/types.ts';
import { FAQ } from '../content/learn.ts';
import { PRIVACY_POLICY, TERMS_OF_USE } from '../content/legal.ts';
import { plainText, readingMinutes } from '../content/helpers.ts';
import { TOOLS } from '../lib/toolLinks.ts';
import { blocksHtml, escapeHtml, inlineHtml } from './html.ts';

export const SITE_NAME = 'Formularium';
export const SITE_TAGLINE = 'Precision formulating for the home lab';
export const SITE_DESCRIPTION = 'Design, balance and document your own skincare and cosmetic formulas: an ingredient library with usage ranges, automatic percentage balancing, safety and selling-limit checks, batch tracking, calculators and beginner guides.';

export interface PageSeo {
    /** Path on the site, starting with "/" */
    path: string;
    /** Page title without the site name (the name is added when the title tag is made) */
    title: string;
    description: string;
    kind: 'website' | 'article';
    /** ISO dates, for articles */
    publishedAt?: string;
    modifiedAt?: string;
    /** Schema.org structured data. Needs the site address to make absolute links, so it is built from the origin. */
    jsonLd: (origin: string) => object[];
    /** Crawlable HTML of the page content, put inside the app's root element at build time */
    html: string;
}

/** The text of the <title> tag */
export function titleTag(title: string): string {
    if (title === SITE_NAME) return `${SITE_NAME}: ${SITE_TAGLINE}`;
    const withName = `${title} | ${SITE_NAME}`;
    return withName.length <= 65 ? withName : title;   // search results cut long titles: keep the descriptive part, drop the name
}

/** Search results show about 155-160 characters: cut at a word boundary and say so with an ellipsis. */
export function shorten(text: string, max = 158): string {
    const clean = plainText(text).replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max - 1);
    return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

const abs = (origin: string, path: string) => `${origin}${path}`;

const organization = (origin: string) => ({
    '@type': 'Organization',
    '@id': abs(origin, '/#organization'),
    name: SITE_NAME,
    url: abs(origin, '/'),
});

const breadcrumbs = (origin: string, trail: { name: string; path: string }[]) => ({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, item: abs(origin, t.path) })),
});

const nav = `<nav aria-label="Main"><a href="/">Home</a> · <a href="/blog">Blog</a> · <a href="/learn">Learn</a> · <a href="/tools">Calculators</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></nav>`;

function shell(heading: string, intro: string, inner: string): string {
    return `${nav}\n<main><h1>${inlineHtml(heading)}</h1>\n<p>${inlineHtml(intro)}</p>\n${inner}</main>`;
}

const articleList = `<ul>${ARTICLES.map(a => `<li><a href="/blog/${a.slug}">${escapeHtml(a.title)}</a>: ${escapeHtml(a.excerpt)}</li>`).join('')}</ul>`;

function articlePage(slug: string): PageSeo {
    const a: Article = ARTICLES.find(x => x.slug === slug)!;
    const path = `/blog/${a.slug}`;
    return {
        path,
        title: a.title,
        description: shorten(a.excerpt),
        kind: 'article',
        publishedAt: a.publishedAt,
        modifiedAt: a.publishedAt,
        jsonLd: origin => [
            {
                '@context': 'https://schema.org',
                '@type': 'Article',
                headline: a.title,
                description: plainText(a.excerpt),
                datePublished: a.publishedAt,
                dateModified: a.publishedAt,
                articleSection: a.category,
                keywords: a.tags.join(', '),
                timeRequired: `PT${readingMinutes(a)}M`,
                inLanguage: 'en',
                mainEntityOfPage: abs(origin, path),
                author: organization(origin),
                publisher: organization(origin),
            },
            breadcrumbs(origin, [{ name: 'Home', path: '/' }, { name: 'Blog', path: '/blog' }, { name: a.title, path }]),
        ],
        // Key takeaways first: a short, direct answer is what search snippets and AI assistants quote
        html: `${nav}\n<main><article><header><p>${escapeHtml(a.category)} · ${escapeHtml(a.level)} · <time datetime="${a.publishedAt}">${a.publishedAt}</time></p>` +
            `<h1>${escapeHtml(a.title)}</h1><p>${escapeHtml(a.excerpt)}</p></header>\n` +
            `<section><h2>Key takeaways</h2><ul>${a.takeaways.map((t: string) => `<li>${inlineHtml(t)}</li>`).join('')}</ul></section>\n` +
            `${blocksHtml(a.body)}\n` +
            `<footer><h2>Related articles</h2><ul>${a.related.map((s: string) => ARTICLES.find(x => x.slug === s)).filter((x): x is Article => !!x)
                .map((x: Article) => `<li><a href="/blog/${x.slug}">${escapeHtml(x.title)}</a></li>`).join('')}</ul></footer></article></main>`,
    };
}

export function publicPages(): PageSeo[] {
    const newest = ARTICLES[0]?.publishedAt;
    const home: PageSeo = {
        path: '/',
        title: SITE_NAME,
        description: shorten(SITE_DESCRIPTION),
        kind: 'website',
        modifiedAt: newest,
        jsonLd: origin => [
            { '@context': 'https://schema.org', '@type': 'WebSite', '@id': abs(origin, '/#website'), name: SITE_NAME, url: abs(origin, '/'), description: SITE_DESCRIPTION, inLanguage: 'en', publisher: organization(origin) },
            {
                '@context': 'https://schema.org',
                '@type': 'SoftwareApplication',
                name: SITE_NAME,
                applicationCategory: 'LifestyleApplication',
                operatingSystem: 'Web',
                description: SITE_DESCRIPTION,
                url: abs(origin, '/'),
            },
        ],
        html: shell(SITE_TAGLINE, SITE_DESCRIPTION,
            `<h2>What you can do</h2><ul>` +
            `<li>Build a formula from an ingredient library with usage ranges, solubility, pH windows and handling notes.</li>` +
            `<li>Balance percentages automatically and get safety checks, preservative and compatibility rules.</li>` +
            `<li>Check ingredient limits for the region where you plan to sell.</li>` +
            `<li>Track batches, your stash of ingredients and containers.</li></ul>` +
            `<h2>Latest guides</h2>${articleList}<p>Free calculators: ${TOOLS.map(t => `<a href="/tools?tool=${t.id}">${escapeHtml(t.label)}</a>`).join(', ')}.</p>`),
    };

    const blog: PageSeo = {
        path: '/blog',
        title: 'Blog: formulating guides for beginners',
        description: 'Step-by-step guides to making your own skincare and cosmetics: first recipes, preservatives, emulsions, pH, ingredients and selling safely.',
        kind: 'website',
        modifiedAt: newest,
        jsonLd: origin => [
            {
                '@context': 'https://schema.org',
                '@type': 'CollectionPage',
                name: `${SITE_NAME} blog`,
                url: abs(origin, '/blog'),
                mainEntity: { '@type': 'ItemList', itemListElement: ARTICLES.map((a, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(origin, `/blog/${a.slug}`), name: a.title })) },
            },
            breadcrumbs(origin, [{ name: 'Home', path: '/' }, { name: 'Blog', path: '/blog' }]),
        ],
        html: shell('Blog: formulating guides for beginners', 'Step-by-step guides to making your own skincare and cosmetics.', articleList),
    };

    const learn: PageSeo = {
        path: '/learn',
        title: 'Learn to formulate: glossary, cheat sheets and FAQ',
        description: 'A formulating learning path with a glossary, cheat sheets, a troubleshooting guide, safety basics and answers to common questions.',
        kind: 'website',
        modifiedAt: newest,
        jsonLd: origin => [
            // Questions and answers in this form are what AI assistants and search features extract most reliably
            { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: plainText(f.a) } })) },
            breadcrumbs(origin, [{ name: 'Home', path: '/' }, { name: 'Learn', path: '/learn' }]),
        ],
        html: shell('Learn to formulate', 'A learning path, glossary, cheat sheets, troubleshooting and safety basics for making your own cosmetics.',
            `<h2>Frequently asked questions</h2>${FAQ.map(f => `<h3>${escapeHtml(f.q)}</h3><p>${inlineHtml(f.a)}</p>`).join('')}`),
    };

    const tools: PageSeo = {
        path: '/tools',
        title: 'Formulation calculators',
        description: 'Free formulating calculators: HLB emulsifier blend, pH adjuster, dilution, preservative amount and unit conversion.',
        kind: 'website',
        modifiedAt: newest,
        jsonLd: origin => [
            { '@context': 'https://schema.org', '@type': 'ItemList', name: 'Formulation calculators', itemListElement: TOOLS.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.label, description: t.blurb, url: abs(origin, `/tools?tool=${t.id}`) })) },
            breadcrumbs(origin, [{ name: 'Home', path: '/' }, { name: 'Calculators', path: '/tools' }]),
        ],
        html: shell('Formulation calculators', 'Small calculators for the maths of making cosmetics.', `<ul>${TOOLS.map(t => `<li><strong>${escapeHtml(t.label)}</strong>: ${escapeHtml(t.blurb)}</li>`).join('')}</ul>`),
    };

    const legal = [PRIVACY_POLICY, TERMS_OF_USE].map((d): PageSeo => ({
        path: `/${d.slug}`,
        title: d.title,
        description: shorten(d.summary[0]),
        kind: 'website',
        jsonLd: () => [],
        html: shell(d.title, d.summary.join(' '), blocksHtml(d.body)),
    }));

    return [home, blog, ...ARTICLES.map(a => articlePage(a.slug)), learn, tools, ...legal];
}

export function pageFor(path: string): PageSeo | undefined {
    return publicPages().find(p => p.path === path);
}
