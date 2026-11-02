import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Clock, Lightbulb } from 'lucide-react';
import Header from '../components/Header';
import ArticleBody from '../components/content/ArticleBody';
import ArticleCard, { CategoryBadge } from '../components/content/ArticleCard';
import { usePageTitle } from '../components/content/usePageTitle';
import { ARTICLES, getArticle } from '../content/articles';
import { readingMinutes, tableOfContents } from '../content/helpers';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';

export default function BlogArticlePage() {
    const { slug } = useParams();
    const article = getArticle(slug);
    const { user } = useAuth();
    const { formatDate } = useSettings();
    usePageTitle(article ? article.title : 'Article not found');

    if (!article) {
        return (
            <div className="min-h-screen bg-[#f7f8f6]">
                <Header title="Blog" backPath="/blog" backLabel="All articles" />
                <main className="max-w-xl mx-auto px-6 py-24 text-center">
                    <h1 className="text-3xl font-bold text-[#1f382a] mb-3">We couldn't find that article</h1>
                    <p className="text-gray-600 mb-8">It may have been moved or renamed.</p>
                    <Link to="/blog" className="inline-flex items-center gap-2 px-6 py-3 bg-[#2c4c3b] text-white font-bold rounded-full hover:bg-[#1f382a]">
                        <ArrowLeft size={16} /> Back to the blog
                    </Link>
                </main>
            </div>
        );
    }

    const toc = tableOfContents(article);
    const related = article.related
        .map(s => ARTICLES.find(a => a.slug === s))
        .filter((a): a is NonNullable<typeof a> => !!a);

    return (
        <div className="min-h-screen bg-[#f7f8f6] text-gray-900 font-sans">
            <Header title="Blog" backPath="/blog" backLabel="All articles" />

            <main className="max-w-6xl mx-auto px-6 py-10 lg:grid lg:grid-cols-[1fr_16rem] lg:gap-12">
                <article className="min-w-0 max-w-3xl">
                    <header className="mb-8">
                        <div className="flex flex-wrap items-center gap-3 mb-4">
                            <CategoryBadge category={article.category} />
                            <span className="text-xs font-medium text-gray-500 border border-gray-200 rounded-sm px-2 py-0.5 bg-white">{article.level}</span>
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold text-[#1f382a] leading-tight mb-4">{article.title}</h1>
                        <p className="text-lg text-gray-600 leading-relaxed mb-4">{article.excerpt}</p>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                            <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
                            <span className="flex items-center gap-1"><Clock size={14} aria-hidden /> {readingMinutes(article)} min read</span>
                        </div>
                    </header>

                    <section aria-labelledby="takeaways" className="bg-white border border-[#c1d1b9] rounded-2xl p-6 mb-8">
                        <h2 id="takeaways" className="flex items-center gap-2 font-bold text-[#1f382a] mb-3">
                            <Lightbulb size={18} className="text-amber-500" aria-hidden /> Key takeaways
                        </h2>
                        <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
                            {article.takeaways.map(t => (
                                <li key={t} className="flex gap-2"><span className="text-[#2c4c3b] font-bold" aria-hidden>✓</span><span>{t}</span></li>
                            ))}
                        </ul>
                    </section>

                    <ArticleBody blocks={article.body} />

                    <div className="flex flex-wrap gap-2 mt-10 pt-6 border-t border-gray-200">
                        {article.tags.map(tag => (
                            <span key={tag} className="text-xs bg-[#e9eee7] text-[#2c4c3b] border border-[#c1d1b9] rounded-full px-3 py-1">#{tag}</span>
                        ))}
                    </div>

                    <section className="mt-10 bg-[#1f382a] rounded-2xl p-8 text-center">
                        <h2 className="text-xl font-bold text-white mb-2">Ready to put it into practice?</h2>
                        <p className="text-[#c1d1b9] text-sm mb-5">Build your formula in the Studio and get live safety checks as you go.</p>
                        <Link to={user ? '/studio/new' : '/'} className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#1f382a] font-bold rounded-full hover:bg-[#e9eee7] transition-colors">
                            {user ? 'Open the Studio' : 'Create a free account'} <ArrowRight size={16} />
                        </Link>
                    </section>
                </article>

                <aside className="hidden lg:block">
                    <div className="sticky top-24 space-y-6">
                        {toc.length > 0 && (
                            <nav aria-label="On this page" className="bg-white border border-[#c1d1b9] rounded-2xl p-5">
                                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">On this page</h2>
                                <ul className="space-y-2 text-sm">
                                    {toc.map(item => (
                                        <li key={item.id}>
                                            <a href={`#${item.id}`} className="text-gray-600 hover:text-[#2c4c3b] hover:underline leading-snug block">{item.text}</a>
                                        </li>
                                    ))}
                                </ul>
                            </nav>
                        )}
                        <div className="bg-[#e9eee7] border border-[#c1d1b9] rounded-2xl p-5 text-sm">
                            <h2 className="font-bold text-[#1f382a] mb-1">Need a definition?</h2>
                            <p className="text-gray-600 mb-3">The glossary explains every term in plain language.</p>
                            <Link to="/learn?tab=glossary" className="font-bold text-[#2c4c3b] hover:underline">Open the glossary &rarr;</Link>
                        </div>
                    </div>
                </aside>
            </main>

            {related.length > 0 && (
                <section className="bg-white border-t border-gray-200 px-6 py-14">
                    <div className="max-w-6xl mx-auto">
                        <h2 className="text-2xl font-bold text-[#1f382a] mb-8">Keep reading</h2>
                        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                            {related.map(a => <ArticleCard key={a.slug} article={a} />)}
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
}
