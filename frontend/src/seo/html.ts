// Turns the editorial content (plain data) into simple semantic HTML, for search engines and AI crawlers that do not run JavaScript.
// The React pages render the same content with full styling: this is only the readable, link-rich version put in the page at build time.

import type { Block } from '../content/types.ts';

export function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Inline markup used in the content: **bold** and [label](/path or https://...). Everything else is escaped. */
export function inlineHtml(text: string): string {
    return escapeHtml(text)
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => `<a href="${href}">${label}</a>`)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

const HEADING_ID = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function blocksHtml(blocks: Block[]): string {
    return blocks.map(block => {
        switch (block.type) {
            case 'h2': return `<h2 id="${HEADING_ID(block.text)}">${inlineHtml(block.text)}</h2>`;
            case 'h3': return `<h3>${inlineHtml(block.text)}</h3>`;
            case 'p': return `<p>${inlineHtml(block.text)}</p>`;
            case 'ul': return `<ul>${block.items.map(i => `<li>${inlineHtml(i)}</li>`).join('')}</ul>`;
            case 'ol': return `<ol>${block.items.map(i => `<li>${inlineHtml(i)}</li>`).join('')}</ol>`;
            case 'callout': return `<aside><strong>${inlineHtml(block.title)}</strong><p>${inlineHtml(block.text)}</p></aside>`;
            case 'table':
                return `<table><thead><tr>${block.headers.map(h => `<th>${inlineHtml(h)}</th>`).join('')}</tr></thead><tbody>${
                    block.rows.map(r => `<tr>${r.map(c => `<td>${inlineHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
            case 'recipe':
                return `<h3>${inlineHtml(block.title)} (${inlineHtml(block.batch)})</h3>${block.phases.map(p =>
                    `<h4>${inlineHtml(p.name)}</h4><ul>${p.items.map(i => `<li>${inlineHtml(i.name)}: ${inlineHtml(i.pct)}${i.note ? ` (${inlineHtml(i.note)})` : ''}</li>`).join('')}</ul>`).join('')}`;
        }
    }).join('\n');
}
