// Builds the pre-rendered HTML of a public page from the built index.html. Pure (no file access): scripts/prerenderPages.ts writes the files.

import { headFor, headHtml } from './head.ts';
import type { PageSeo } from './pages.ts';

export const START = '<!-- seo:start -->';
export const END = '<!-- seo:end -->';
export const EMPTY_ROOT = '<div id="root"></div>';
// The readable copy of a page lives in one wrapper, and its style is scoped to that wrapper. This matters: the <style> stays in the page after the app
// starts (React only replaces what is inside #root), so a rule on `body` would squeeze the whole app into a narrow column.
export const WRAPPER_CLASS = 'seo-static';
const STYLE = '<style>.seo-static{font:16px/1.6 system-ui,sans-serif;max-width:46rem;margin:0 auto;padding:1rem;color:#1f382a}.seo-static table{border-collapse:collapse}.seo-static td,.seo-static th{border:1px solid #c1d1b9;padding:.25rem .5rem;text-align:left}.seo-static a{color:#2c4c3b}</style>';

/** The built index.html with this page's head tags and a readable copy of its content */
export function renderPage(template: string, page: PageSeo, origin: string): string {
    const head = `${START}
    ${headHtml(headFor(page, origin))}
    ${STYLE}
    ${END}`;
    const from = template.indexOf(START);
    const to = template.indexOf(END) + END.length;
    return (template.slice(0, from) + head + template.slice(to))
        .replace(EMPTY_ROOT, () => `<div id="root"><div class="${WRAPPER_CLASS}">${page.html}</div></div>`);
}

