import { ARTICLES } from './articles';
import { CHEAT_SHEETS, FAQ, GLOSSARY, TROUBLESHOOTING } from './learn';
import { articleText, plainText } from './helpers';
import type { Article, CheatSheet, FaqItem, GlossaryEntry, TroubleshootingItem } from './types';

export interface LearnResults {
    glossary: GlossaryEntry[];
    troubleshooting: TroubleshootingItem[];
    faq: FaqItem[];
    cheatSheets: CheatSheet[];
    articles: Article[];
    total: number;
}

const terms = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);

// Every word must appear somewhere in the text
const matches = (haystack: string, words: string[]) => {
    const text = haystack.toLowerCase();
    return words.every(w => text.includes(w));
};

export function searchLearn(query: string): LearnResults {
    const words = terms(query);
    if (words.length === 0) {
        return { glossary: [], troubleshooting: [], faq: [], cheatSheets: [], articles: [], total: 0 };
    }

    const glossary = GLOSSARY.filter(g => matches(`${g.term} ${g.definition}`, words));
    const troubleshooting = TROUBLESHOOTING.filter(t => matches([t.problem, ...t.causes, ...t.fixes].join(' '), words));
    const faq = FAQ.filter(f => matches(`${f.q} ${plainText(f.a)}`, words));
    const cheatSheets = CHEAT_SHEETS.filter(s => matches([s.title, s.intro, ...s.headers, ...s.rows.flat()].join(' '), words));
    const articles = ARTICLES.filter(a => matches(`${articleText(a)} ${a.tags.join(' ')} ${a.category}`, words));

    return {
        glossary,
        troubleshooting,
        faq,
        cheatSheets,
        articles,
        total: glossary.length + troubleshooting.length + faq.length + cheatSheets.length + articles.length,
    };
}
