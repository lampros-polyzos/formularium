import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';
import Header from '../components/Header';
import ArticleCard from '../components/content/ArticleCard';
import CommunityCard from '../components/content/CommunityCard';
import { useCommunityArticles } from '../components/content/useCommunityArticles';
import { usePageTitle } from '../components/content/usePageTitle';
import { ARTICLES } from '../content/articles';
import { communityText, type CommunityArticle } from '../content/community';
import { articleText, CATEGORIES } from '../content/helpers';
import type { Article, ArticleCategory } from '../content/types';
import { useAuth } from '../contexts/AuthContext';

type Filter = ArticleCategory | 'All' | 'Community';

type Entry =
    | { kind: 'guide'; article: Article; date: string; text: string }
    | { kind: 'community'; post: CommunityArticle; date: string; text: string };

export default function BlogPage() {
    usePageTitle('Blog');
    const { user } = useAuth();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const { posts: communityPosts } = useCommunityArticles();

    // /blog?filter=community opens straight on the community articles
    const [filter, setFilter] = useState<Filter>(params.get('filter') === 'community' ? 'Community' : 'All');
    const [query, setQuery] = useState('');

    const entries = useMemo<Entry[]>(() => [
        ...ARTICLES.map(article => ({
            kind: 'guide' as const,
            article,
            date: article.publishedAt,
            text: `${articleText(article)} ${article.tags.join(' ')}`.toLowerCase(),
        })),
        ...communityPosts.map(post => ({
            kind: 'community' as const,
            post,
            date: post.createdAt,
            text: communityText(post).toLowerCase(),
        })),
    ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)), [communityPosts]);

    const counts = useMemo(() => {
        const result = new Map<Filter, number>([['All', entries.length], ['Community', communityPosts.length]]);
        CATEGORIES.forEach(c => result.set(c, ARTICLES.filter(a => a.category === c).length));
        return result;
    }, [entries.length, communityPosts.length]);

    const filtered = useMemo(() => {
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        return entries.filter(entry => {
            if (filter === 'Community' && entry.kind !== 'community') return false;
            if (filter !== 'All' && filter !== 'Community' && (entry.kind !== 'guide' || entry.article.category !== filter)) return false;
            return words.every(w => entry.text.includes(w));
        });
    }, [entries, filter, query]);

    // The featured card only shows on the unfiltered view
    const isFiltering = query.trim() !== '' || filter !== 'All';
    const featured = !isFiltering ? ARTICLES.find(a => a.featured) : undefined;
    const rest = featured ? filtered.filter(e => !(e.kind === 'guide' && e.article.slug === featured.slug)) : filtered;

    return (
        <div className="min-h-screen bg-[#f7f8f6] text-gray-900 font-sans">
            <Header title="Blog" />

            <section className="bg-[#d8e2d3] px-6 py-14 rounded-b-[3rem]">
                <div className="max-w-5xl mx-auto text-center">
                    <h1 className="text-4xl md:text-5xl font-bold text-[#1f382a] mb-4">The Formulator's Blog</h1>
                    <p className="text-lg text-[#3a5a4a] max-w-2xl mx-auto mb-8">
                        Practical guides for home formulators, plus articles written by the community: how things work, why recipes fail and how to make them safely.
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
                    {(['All', ...CATEGORIES, 'Community'] as const).map(f => (
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
                        {rest.map(entry => entry.kind === 'guide'
                            ? <ArticleCard key={entry.article.slug} article={entry.article} />
                            : (
                                <CommunityCard
                                    key={entry.post.id}
                                    post={entry.post}
                                    membersOnly={!user}
                                    onOpen={user ? undefined : () => navigate('/')}
                                />
                            ))}
                    </div>
                ) : !featured && (
                    <div className="text-center py-16 text-gray-500">
                        <p className="font-medium mb-1">
                            {filter === 'Community' && query.trim() === '' ? 'No community articles yet.' : 'No articles match your search.'}
                        </p>
                        {filter === 'Community' && query.trim() === '' && (
                            <p className="text-sm mb-2">Share what you know: post an Education article in the community.</p>
                        )}
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
                            <h2 className="text-xl font-bold text-purple-950 mb-1">Got something to teach?</h2>
                            <p className="text-purple-900/80 text-sm">Education posts you write in the community appear here, next to our guides.</p>
                        </div>
                        <Link to="/community" className="self-start inline-flex items-center gap-2 px-5 py-2.5 bg-purple-900 text-white font-bold rounded-full hover:bg-purple-950 transition-colors text-sm">
                            Write an article <ArrowRight size={16} />
                        </Link>
                    </div>
                </section>
            </main>
        </div>
    );
}
