// Site-wide files for crawlers: sitemap.xml, llms.txt and the robots.txt sitemap line. Pure functions, written to disk by scripts/prerender.ts.

import { ARTICLES } from '../content/articles.ts';
import { escapeHtml } from './html.ts';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, publicPages } from './pages.ts';

export function sitemapXml(origin: string): string {
    const urls = publicPages().map(p => {
        const lastmod = p.modifiedAt ? `<lastmod>${p.modifiedAt}</lastmod>` : '';
        return `  <url><loc>${escapeHtml(origin + p.path)}</loc>${lastmod}</url>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/**
 * llms.txt: a short plain-text guide to the site for AI assistants (https://llmstxt.org). It says what the site is and points to
 * the pages worth reading, so an assistant answering a formulating question can find and cite them.
 */
export function llmsTxt(origin: string): string {
    const at = (path: string) => `${origin}${path}`;
    return [
        `# ${SITE_NAME}`,
        '',
        `> ${SITE_TAGLINE}. ${SITE_DESCRIPTION}`,
        '',
        'Formularium is a tool and a set of guides for people who make their own skincare and cosmetics. The guides are educational, not medical or legal advice.',
        '',
        '## Guides',
        ...ARTICLES.map(a => `- [${a.title}](${at(`/blog/${a.slug}`)}): ${a.excerpt}`),
        '',
        '## Reference',
        `- [Learn hub](${at('/learn')}): learning path, glossary, cheat sheets, troubleshooting, safety basics and FAQ`,
        `- [Calculators](${at('/tools')}): HLB blend, pH adjuster, dilution, preservative amount and unit conversion`,
        '',
        '## Policies',
        `- [Privacy policy](${at('/privacy')})`,
        `- [Terms of use](${at('/terms')})`,
        '',
    ].join('\n');
}

/** robots.txt keeps its rules and gains the sitemap address, which must be absolute */
export function robotsWithSitemap(robots: string, origin: string): string {
    const kept = robots.split('\n').filter(l => !/^\s*sitemap:/i.test(l)).join('\n').trimEnd();
    return `${kept}\n\nSitemap: ${origin}/sitemap.xml\n`;
}
