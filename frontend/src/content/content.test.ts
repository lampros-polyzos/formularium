import { describe, expect, it } from 'vitest';
import { ARTICLES } from './articles';
import { blockText, CATEGORIES, headingId, internalLinks, readingMinutes, tableOfContents } from './helpers';
import { CHEAT_SHEETS, FAQ, GLOSSARY, LEARNING_PATH, TROUBLESHOOTING } from './learn';
import { searchLearn } from './search';
import { isToolId } from '../lib/toolLinks';
import { excerptOf, toCommunityArticle } from './community';

const slugs = new Set(ARTICLES.map(a => a.slug));
const TABS = new Set(['start', 'glossary', 'cheatsheets', 'troubleshooting', 'safety', 'faq']);

// Every internal link in the content must point at a real page
function isValidInternalLink(href: string): boolean {
    const [path, queryString] = href.split('?');
    if (path === '/blog') return true;
    if (path.startsWith('/blog/')) return slugs.has(path.slice('/blog/'.length));
    if (path === '/tools') return isToolId(new URLSearchParams(queryString ?? '').get('tool'));
    if (path === '/learn') return !queryString || TABS.has(new URLSearchParams(queryString).get('tab') ?? '');
    return ['/studio/new', '/library', '/stash', '/community', '/'].includes(path);
}

function allTexts(): string[] {
    return [
        ...ARTICLES.flatMap(a => [a.excerpt, ...a.takeaways, ...a.body.map(blockText)]),
        ...FAQ.map(f => f.a),
    ];
}

describe('articles', () => {
    it('have unique slugs and titles', () => {
        expect(slugs.size).toBe(ARTICLES.length);
        expect(new Set(ARTICLES.map(a => a.title)).size).toBe(ARTICLES.length);
    });

    it('use known categories and valid dates', () => {
        for (const a of ARTICLES) {
            expect(CATEGORIES).toContain(a.category);
            expect(Number.isNaN(Date.parse(a.publishedAt))).toBe(false);
        }
    });

    it('are sorted newest first', () => {
        const dates = ARTICLES.map(a => a.publishedAt);
        expect([...dates].sort().reverse()).toEqual(dates);
    });

    it('only relate to existing, different articles', () => {
        for (const a of ARTICLES) {
            for (const r of a.related) {
                expect(slugs.has(r), `${a.slug} -> ${r}`).toBe(true);
                expect(r).not.toBe(a.slug);
            }
        }
    });

    it('have unique heading ids (they become anchors)', () => {
        for (const a of ARTICLES) {
            const ids = tableOfContents(a).map(t => t.id);
            expect(new Set(ids).size, a.slug).toBe(ids.length);
        }
    });

    it('have takeaways and a sensible reading time', () => {
        for (const a of ARTICLES) {
            expect(a.takeaways.length).toBeGreaterThanOrEqual(2);
            expect(readingMinutes(a)).toBeGreaterThanOrEqual(1);
        }
    });

    it('have well-formed tables', () => {
        for (const a of ARTICLES) {
            for (const block of a.body) {
                if (block.type === 'table') {
                    for (const row of block.rows) expect(row.length, `${a.slug} table`).toBe(block.headers.length);
                }
            }
        }
    });

    it('have at most one featured article', () => {
        expect(ARTICLES.filter(a => a.featured).length).toBeLessThanOrEqual(1);
    });
});

describe('learn content', () => {
    it('has a unique, alphabetical glossary', () => {
        const terms = GLOSSARY.map(g => g.term);
        expect(new Set(terms.map(t => t.toLowerCase())).size).toBe(terms.length);
        expect(terms).toEqual([...terms].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
    });

    it('links glossary and troubleshooting entries to real articles', () => {
        for (const g of GLOSSARY) if (g.article) expect(slugs.has(g.article), g.term).toBe(true);
        for (const t of TROUBLESHOOTING) if (t.article) expect(slugs.has(t.article), t.id).toBe(true);
    });

    it('has unique troubleshooting and cheat sheet ids', () => {
        expect(new Set(TROUBLESHOOTING.map(t => t.id)).size).toBe(TROUBLESHOOTING.length);
        expect(new Set(CHEAT_SHEETS.map(s => s.id)).size).toBe(CHEAT_SHEETS.length);
    });

    it('has cheat sheet rows matching their headers', () => {
        for (const s of CHEAT_SHEETS) for (const row of s.rows) expect(row.length, s.id).toBe(s.headers.length);
    });

    it('has at least one cause and fix for every problem', () => {
        for (const t of TROUBLESHOOTING) {
            expect(t.causes.length, t.id).toBeGreaterThan(0);
            expect(t.fixes.length, t.id).toBeGreaterThan(0);
        }
    });
});

describe('links', () => {
    it('all internal links point at real pages', () => {
        const hrefs = [
            ...allTexts().flatMap(internalLinks),
            ...LEARNING_PATH.flatMap(s => s.links.map(l => l.to)),
        ];
        expect(hrefs.length).toBeGreaterThan(0);
        for (const href of hrefs) expect(isValidInternalLink(href), href).toBe(true);
    });
});

describe('headingId', () => {
    it('makes url-safe ids', () => {
        expect(headingId(`1. Measuring with spoons & cups`)).toBe('1-measuring-with-spoons-cups');
    });
});

describe('searchLearn', () => {
    it('returns nothing for an empty query', () => {
        expect(searchLearn('   ').total).toBe(0);
    });

    it('finds glossary terms, troubleshooting and articles', () => {
        const hlb = searchLearn('hlb');
        expect(hlb.glossary.some(g => g.term === 'HLB')).toBe(true);

        const grainy = searchLearn('grainy');
        expect(grainy.troubleshooting.some(t => t.id === 'grainy')).toBe(true);

        expect(searchLearn('preservative').articles.some(a => a.slug === 'preservatives-101')).toBe(true);
    });

    it('requires every word to match', () => {
        expect(searchLearn('preservative zzzznotaword').total).toBe(0);
    });
});

describe('community articles', () => {
    it('shortens excerpts at a word boundary', () => {
        const long = 'word '.repeat(100);
        const excerpt = excerptOf(long, 50);
        expect(excerpt.length).toBeLessThanOrEqual(53);
        expect(excerpt.endsWith('...')).toBe(true);
        expect(excerptOf('short text')).toBe('short text');
        expect(excerptOf(null)).toBe('');
    });

    it('maps a database row, tolerating odd tag shapes and missing fields', () => {
        const base = { id: '1', title: 'T', write_up: null, created_at: '2026-01-01T00:00:00Z' };
        expect(toCommunityArticle({ ...base, tags: ['a', 'b'] }).tags).toEqual(['a', 'b']);
        expect(toCommunityArticle({ ...base, tags: 'solo' }).tags).toEqual(['solo']);
        expect(toCommunityArticle({ ...base, tags: null }).tags).toEqual([]);
        const post = toCommunityArticle({ ...base, tags: null });
        expect(post.authorName).toBeNull();
        expect(post.minutes).toBe(1);
    });
});
