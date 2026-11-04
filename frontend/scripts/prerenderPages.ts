// Runs at the end of `vite build` (see the plugin in vite.config.ts): writes a real HTML file for every public page, plus sitemap.xml and llms.txt.
//
// The app is a single-page app, so without this every address returns the same empty page and only crawlers that run JavaScript see
// any content. Each page here carries its own title, description, canonical address, social tags, structured data and a readable
// copy of its content inside the root element (the app replaces it as soon as it starts).
//
// Set VITE_SITE_URL (in the environment or an .env file) to the public address, for example https://formularium.example. Without it the pages still get
// their own titles, descriptions and content, but the sitemap, canonical links and structured data (which need absolute
// addresses) are skipped instead of guessing.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cleanOrigin } from '../src/seo/head.ts';
import { publicPages } from '../src/seo/pages.ts';
import { EMPTY_ROOT, END, START, renderPage } from '../src/seo/prerender.ts';
import { llmsTxt, robotsWithSitemap, sitemapXml } from '../src/seo/site.ts';

/** Writes the public pages, sitemap.xml and llms.txt into the build folder. Returns what it did, for logging. */
export function prerenderPages(dist: string, siteUrl: string | undefined): string {
    const origin = cleanOrigin(siteUrl);
    const template = readFileSync(join(dist, 'index.html'), 'utf8');
    if (!template.includes(START) || !template.includes(END)) throw new Error('index.html has no seo:start / seo:end markers.');
    if (!template.includes(EMPTY_ROOT)) throw new Error('index.html has no empty <div id="root"></div> to fill.');

    const pages = publicPages();
    for (const page of pages) {
        const file = page.path === '/' ? join(dist, 'index.html') : join(dist, page.path, 'index.html');
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, renderPage(template, page, origin));
    }
    if (!origin) return `Prerendered ${pages.length} pages. VITE_SITE_URL is not set, so sitemap.xml, llms.txt, canonical links and structured data were skipped.`;

    writeFileSync(join(dist, 'sitemap.xml'), sitemapXml(origin));
    writeFileSync(join(dist, 'llms.txt'), llmsTxt(origin));
    const robots = join(dist, 'robots.txt');
    if (existsSync(robots)) writeFileSync(robots, robotsWithSitemap(readFileSync(robots, 'utf8'), origin));
    return `Prerendered ${pages.length} pages for ${origin}, with sitemap.xml and llms.txt.`;
}
