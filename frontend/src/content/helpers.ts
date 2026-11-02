import type { Article, ArticleCategory, Block } from './types';

export const CATEGORIES: ArticleCategory[] = ['Getting started', 'Ingredients', 'Techniques', 'Safety'];

// Tailwind classes per category (kept here so cards, badges and article headers agree)
export const CATEGORY_STYLE: Record<ArticleCategory, { badge: string; cover: string }> = {
    'Getting started': { badge: 'bg-emerald-50 text-emerald-800 border-emerald-200', cover: 'from-[#d8e2d3] to-[#b9ccb2]' },
    'Ingredients': { badge: 'bg-amber-50 text-amber-800 border-amber-200', cover: 'from-[#efe8cf] to-[#e0d4a8]' },
    'Techniques': { badge: 'bg-sky-50 text-sky-800 border-sky-200', cover: 'from-[#d6e4ea] to-[#b5ccd6]' },
    'Safety': { badge: 'bg-rose-50 text-rose-800 border-rose-200', cover: 'from-[#ecd9d6] to-[#dbbab5]' },
};

export function headingId(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Strips the inline markup so word counts and search see plain text
export function plainText(text: string): string {
    return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*/g, '');
}

export function blockText(block: Block): string {
    switch (block.type) {
        case 'h2':
        case 'h3':
        case 'p':
            return plainText(block.text);
        case 'ul':
        case 'ol':
            return block.items.map(plainText).join(' ');
        case 'callout':
            return `${block.title} ${plainText(block.text)}`;
        case 'table':
            return [...block.headers, ...block.rows.flat()].map(plainText).join(' ');
        case 'recipe':
            return block.phases.flatMap(p => [p.name, ...p.items.flatMap(i => [i.name, i.pct, i.note ?? ''])]).join(' ');
    }
}

export function articleText(article: Article): string {
    return [article.title, article.excerpt, ...article.takeaways.map(plainText), ...article.body.map(blockText)].join(' ');
}

export function readingMinutes(article: Article): number {
    const words = articleText(article).split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
}

export function tableOfContents(article: Article): { id: string; text: string }[] {
    return article.body
        .filter((b): b is Extract<Block, { type: 'h2' }> => b.type === 'h2')
        .map(b => ({ id: headingId(b.text), text: b.text }));
}

// Internal links used inside article text: [label](/path)
export function internalLinks(text: string): string[] {
    return [...text.matchAll(/\]\((\/[^)]*)\)/g)].map(m => m[1]);
}
