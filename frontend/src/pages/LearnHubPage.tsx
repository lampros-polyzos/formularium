import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookOpen, ClipboardList, GraduationCap, HelpCircle, Search, ShieldCheck, Table2, Wrench, X } from 'lucide-react';
import Header from '../components/Header';
import ArticleCard from '../components/content/ArticleCard';
import {
    CheatSheetsSection,
    FaqSection,
    GlossarySection,
    SafetySection,
    StartSection,
    TroubleshootingSection,
} from '../components/content/LearnSections';
import { usePageTitle } from '../components/content/usePageTitle';
import { ARTICLES } from '../content/articles';
import { FAQ, GLOSSARY, TROUBLESHOOTING } from '../content/learn';
import { searchLearn } from '../content/search';

const TABS = [
    { id: 'start', label: 'Start here', icon: GraduationCap, blurb: `A step-by-step path from your first question to your first batch.` },
    { id: 'glossary', label: 'Glossary', icon: BookOpen, blurb: `Plain-language definitions for every term you will meet.` },
    { id: 'cheatsheets', label: 'Cheat sheets', icon: Table2, blurb: `Quick-reference tables for usage rates, pH, phases and proportions.` },
    { id: 'troubleshooting', label: 'Troubleshooting', icon: Wrench, blurb: `Something went wrong? Find the likely cause and the fix.` },
    { id: 'safety', label: 'Safety', icon: ShieldCheck, blurb: `The habits that keep you, and your products, safe.` },
    { id: 'faq', label: 'FAQ', icon: HelpCircle, blurb: `Quick answers to the questions beginners ask most.` },
] as const;

type TabId = (typeof TABS)[number]['id'];

function ResultGroup({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
    if (count === 0) return null;
    return (
        <section className="mb-10">
            <h2 className="text-lg font-bold text-[#1f382a] mb-4">{title} <span className="text-gray-400 font-normal">({count})</span></h2>
            {children}
        </section>
    );
}

export default function LearnHubPage() {
    usePageTitle('Learn');
    const [params, setParams] = useSearchParams();
    const query = params.get('q') ?? '';
    const requestedTab = params.get('tab');
    const tab: TabId = TABS.some(t => t.id === requestedTab) ? (requestedTab as TabId) : 'start';
    const activeTab = TABS.find(t => t.id === tab)!;

    const results = useMemo(() => searchLearn(query), [query]);
    const isSearching = query.trim() !== '';

    const setQuery = (value: string) => {
        const next = new URLSearchParams(params);
        if (value) next.set('q', value); else next.delete('q');
        setParams(next, { replace: true });
    };
    const setTab = (id: TabId) => {
        const next = new URLSearchParams(params);
        next.set('tab', id);
        next.delete('q');
        setParams(next);
    };

    return (
        <div className="min-h-screen bg-[#f7f8f6] text-gray-900 font-sans">
            <Header title="Learn" />

            <section className="bg-[#d8e2d3] px-6 py-14 rounded-b-[3rem]">
                <div className="max-w-4xl mx-auto text-center">
                    <h1 className="text-4xl md:text-5xl font-bold text-[#1f382a] mb-4">Learn to formulate</h1>
                    <p className="text-lg text-[#3a5a4a] max-w-2xl mx-auto mb-8">
                        The essentials of home formulation in one place: definitions, quick references and fixes for common problems.
                    </p>
                    <div className="max-w-xl mx-auto flex items-center bg-white rounded-full px-5 py-3 border border-[#c1d1b9] shadow-sm focus-within:ring-2 focus-within:ring-[#2c4c3b]">
                        <Search size={18} className="text-gray-400 mr-3 shrink-0" aria-hidden />
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search everything: HLB, grainy, preservative, pH..."
                            aria-label="Search the Learn hub"
                            className="w-full bg-transparent outline-none text-sm text-gray-700"
                        />
                        {query && (
                            <button onClick={() => setQuery('')} aria-label="Clear search" className="text-gray-400 hover:text-gray-700 ml-2">
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </section>

            <main className="max-w-5xl mx-auto px-6 py-10">
                {isSearching ? (
                    <div>
                        <p className="text-sm text-gray-500 mb-8" aria-live="polite">
                            {results.total === 0 ? 'No results' : `${results.total} result${results.total !== 1 ? 's' : ''}`} for <strong className="text-gray-800">"{query.trim()}"</strong>
                        </p>

                        {results.total === 0 && (
                            <div className="text-center py-12 text-gray-500">
                                <p className="mb-3">Try a simpler or more general word, or browse by topic.</p>
                                <button onClick={() => setQuery('')} className="font-bold text-[#2c4c3b] hover:underline">Back to the hub</button>
                            </div>
                        )}

                        <ResultGroup title="Glossary" count={results.glossary.length}>
                            <GlossarySection entries={results.glossary} showIndex={false} />
                        </ResultGroup>
                        <ResultGroup title="Troubleshooting" count={results.troubleshooting.length}>
                            <TroubleshootingSection items={results.troubleshooting} />
                        </ResultGroup>
                        <ResultGroup title="Cheat sheets" count={results.cheatSheets.length}>
                            <CheatSheetsSection sheets={results.cheatSheets} />
                        </ResultGroup>
                        <ResultGroup title="FAQ" count={results.faq.length}>
                            <FaqSection items={results.faq} />
                        </ResultGroup>
                        <ResultGroup title="Articles" count={results.articles.length}>
                            <div className="grid gap-6 sm:grid-cols-2">
                                {results.articles.map(a => <ArticleCard key={a.slug} article={a} />)}
                            </div>
                        </ResultGroup>
                    </div>
                ) : (
                    <>
                        <div role="tablist" aria-label="Learn sections" className="flex gap-2 overflow-x-auto pb-3 mb-6 -mx-1 px-1">
                            {TABS.map(t => {
                                const Icon = t.icon;
                                const selected = t.id === tab;
                                return (
                                    <button
                                        key={t.id}
                                        role="tab"
                                        aria-selected={selected}
                                        onClick={() => setTab(t.id)}
                                        className={`shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${selected
                                            ? 'bg-[#2c4c3b] text-white border-[#2c4c3b]'
                                            : 'bg-white text-[#2c4c3b] border-[#c1d1b9] hover:bg-[#e9eee7]'}`}
                                    >
                                        <Icon size={16} aria-hidden /> {t.label}
                                    </button>
                                );
                            })}
                        </div>

                        <p className="text-gray-600 mb-8">{activeTab.blurb}</p>

                        <div role="tabpanel">
                            {tab === 'start' && <StartSection />}
                            {tab === 'glossary' && <GlossarySection entries={GLOSSARY} />}
                            {tab === 'cheatsheets' && <CheatSheetsSection />}
                            {tab === 'troubleshooting' && <TroubleshootingSection items={TROUBLESHOOTING} />}
                            {tab === 'safety' && <SafetySection />}
                            {tab === 'faq' && <FaqSection items={FAQ} />}
                        </div>
                    </>
                )}

                <section className="mt-16">
                    <div className="flex items-baseline justify-between mb-6">
                        <h2 className="text-2xl font-bold text-[#1f382a]">From the blog</h2>
                        <Link to="/blog" className="text-sm font-bold text-[#2c4c3b] hover:underline inline-flex items-center gap-1">All articles <ArrowRight size={14} /></Link>
                    </div>
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {ARTICLES.slice(0, 3).map(a => <ArticleCard key={a.slug} article={a} />)}
                    </div>
                </section>

                <section className="mt-12 bg-[#1f382a] rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                        <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2"><ClipboardList size={20} aria-hidden /> Ready to try it?</h2>
                        <p className="text-[#c1d1b9] text-sm">Build a formula in the Studio and get live checks as you work.</p>
                    </div>
                    <Link to="/studio/new" className="shrink-0 inline-flex items-center gap-2 px-6 py-3 bg-white text-[#1f382a] font-bold rounded-full hover:bg-[#e9eee7] transition-colors">
                        Open the Studio <ArrowRight size={16} />
                    </Link>
                </section>
            </main>
        </div>
    );
}
