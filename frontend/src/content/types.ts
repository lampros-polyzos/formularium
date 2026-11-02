// Editorial content is plain data: no HTML strings, so the renderer controls all markup.
// Inline formatting inside any `text`: **bold** and [label](/internal/path or https://external).

export type Block =
    | { type: 'h2'; text: string }
    | { type: 'h3'; text: string }
    | { type: 'p'; text: string }
    | { type: 'ul'; items: string[] }
    | { type: 'ol'; items: string[] }
    | { type: 'callout'; tone: 'tip' | 'warning' | 'info'; title: string; text: string }
    | { type: 'table'; headers: string[]; rows: string[][] }
    | { type: 'recipe'; title: string; batch: string; phases: RecipePhase[] };

export interface RecipePhase {
    name: string;
    items: { name: string; pct: string; note?: string }[];
}

export type ArticleCategory = 'Getting started' | 'Ingredients' | 'Techniques' | 'Safety';
export type ArticleLevel = 'Beginner' | 'Intermediate';

export interface Article {
    slug: string;
    title: string;
    excerpt: string;
    category: ArticleCategory;
    level: ArticleLevel;
    publishedAt: string; // ISO date
    tags: string[];
    featured?: boolean;
    takeaways: string[];
    related: string[]; // slugs
    body: Block[];
}

export interface GlossaryEntry {
    term: string;
    definition: string;
    article?: string; // slug for "read more"
}

export interface LearningStep {
    title: string;
    text: string;
    links: { label: string; to: string }[];
}

export interface CheatSheet {
    id: string;
    title: string;
    intro: string;
    headers: string[];
    rows: string[][];
    note?: string;
}

export interface TroubleshootingItem {
    id: string;
    problem: string;
    causes: string[];
    fixes: string[];
    article?: string;
}

export interface ChecklistGroup {
    title: string;
    items: string[];
}

export interface FaqItem {
    q: string;
    a: string;
}
