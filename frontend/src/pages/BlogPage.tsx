import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';
import Header from '../components/Header';
import ArticleCard from '../components/content/ArticleCard';
import { usePageTitle } from '../components/content/usePageTitle';
import { ARTICLES } from '../content/articles';
import { articleText, CATEGORIES } from '../content/helpers';
import type { ArticleCategory } from '../content/types';

type Filter = ArticleCategory | 'All';

// The articles are our own. What members write stays in the community (Advice and Information posts), not here.
export default function BlogPage() {
    usePageTitle('Blog');
    const [filter, setFilter] = useState<Filter>('All');
    const [query, setQuery] = useState('');

    const entries = useMemo(() => ARTICLES.map(article => ({
        article,
        text: `${articleText(article)} ${article.tags.join(' ')}`.toLowerCase(),
    })), []);

    const counts = useMemo(() => {
        const result = new Map<Filter, number>([['All', ARTICLES.length]]);
        CATEGORIES.forEach(c => result.set(c, ARTICLES.filter(a => a.category === c).length));
        return result;
    }, []);

    const filtered = useMemo(() => {
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        return entries.filter(({ article, text }) =>
            (filter === 'All' || article.category === filter) && words.every(w => text.includes(w)));
    }, [entries, filter, query]);

    // The featured card only shows on the unfiltered view
    const isFiltering = query.trim() !== '' || filter !== 'All';
    const featured = !isFiltering ? ARTICLES.find(a => a.featured) : undefined;
    const rest = featured ? filtered.filter(({ article }) => article.slug !== featured.slug) : filtered;

    return (
        <div className="min-h-screen bg-[#f7f8f6] text-gray-900 font-sans">
            <Header title="Blog" />

            <section className="bg-[#d8e2d3] px-6 py-14 rounded-b-[3rem]">
                <div className="max-w-5xl mx-auto text-center">
                    <h1 className="text-4xl md:text-5xl font-bold text-[#1f382a] mb-4">The Formulator's Blog</h1>
                    <p className="text-lg text-[#3a5a4a] max-w-2xl mx-auto mb-8">
                        Practical guides for home formulators: how things work, why recipes fail and how to make them safely.
                    </p>
                    <div className="max-w-xl mx-auto flex items-center bg-white rounded-full px-5 py-3 border border-[#c1d1b9] shadow-sm focus-within:ring-2 focus-within:ring-[#2c4c3b]">
                        <Search size={18} className="text-gray-400 mr-3 shrink-0" aria-hidden />
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search articles, e.g. preservative, pH, emulsion..."
                            aria-label="Search articles"
                            className="w-full bg-transparent outline-none text-sm text-gray-700"
                        />
                    </div>
                </div>
            </section>

            <main className="max-w-6xl mx-auto px-6 py-12">
                <div className="flex flex-wrap gap-2 mb-8" role="group" aria-label="Filter by category">
                    {(['All', ...CATEGORIES] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            aria-pressed={filter === f}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${filter === f
                                ? 'bg-[#2c4c3b] text-white border-[#2c4c3b]'
                                : 'bg-white text-[#2c4c3b] border-[#c1d1b9] hover:bg-[#e9eee7]'}`}
                        >
                            {f} <span className="opacity-60">({counts.get(f)})</span>
                        </button>
                    ))}
                </div>

                {featured && <div className="mb-10"><ArticleCard article={featured} featured /></div>}

                {rest.length > 0 ? (
                    <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                        {rest.map(({ article }) => <ArticleCard key={article.slug} article={article} />)}
                    </div>
                ) : !featured && (
                    <div className="text-center py-16 text-gray-500">
                        <p className="font-medium mb-1">No articles match your search.</p>
                        <button onClick={() => { setQuery(''); setFilter('All'); }} className="text-[#2c4c3b] font-bold hover:underline">
                            Clear filters
                        </button>
                    </div>
                )}

                <section className="mt-16 grid gap-6 md:grid-cols-2">
                    <div className="bg-[#1f382a] rounded-2xl p-8 flex flex-col justify-between gap-5">
                        <div>
                            <h2 className="text-xl font-bold text-white mb-1">New to formulating?</h2>
                            <p className="text-[#c1d1b9] text-sm">The Learn hub has a glossary, cheat sheets and a troubleshooting guide to keep beside you.</p>
                        </div>
                        <Link to="/learn" className="self-start inline-flex items-center gap-2 px-5 py-2.5 bg-white text-[#1f382a] font-bold rounded-full hover:bg-[#e9eee7] transition-colors text-sm">
                            Open the Learn hub <ArrowRight size={16} />
                        </Link>
                    </div>
                    <div className="bg-[#e6dcef] border border-[#cdbde0] rounded-2xl p-8 flex flex-col justify-between gap-5">
                        <div>
                            <h2 className="text-xl font-bold text-purple-950 mb-1">Have a question, or a tip to share?</h2>
                            <p className="text-purple-900/80 text-sm">Ask for advice or share useful information in the community. The articles here are written and kept up to date by us.</p>
                        </div>
                        <Link to="/community" className="self-start inline-flex items-center gap-2 px-5 py-2.5 bg-purple-900 text-white font-bold rounded-full hover:bg-purple-950 transition-colors text-sm">
                            Visit the community <ArrowRight size={16} />
                        </Link>
                    </div>
                </section>
            </main>
        </div>
    );
}
