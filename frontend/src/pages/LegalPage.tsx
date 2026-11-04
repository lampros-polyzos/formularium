import { Link } from 'react-router-dom';
import { Beaker } from 'lucide-react';
import ArticleBody from '../components/content/ArticleBody';
import { RichText } from '../components/content/ArticleBody';
import { useSeo } from '../seo/useSeo';
import { headingId } from '../content/helpers';
import { LEGAL, type LegalDocument } from '../content/legal';
import { useSettings } from '../contexts/SettingsContext';

export default function LegalPage({ document }: { document: LegalDocument }) {
    useSeo(`/${document.slug}`);
    const { formatDate } = useSettings();
    const sections = document.body.flatMap(b => (b.type === 'h2' ? [b.text] : []));
    const other = document.slug === 'privacy'
        ? { to: '/terms', label: 'Terms of Use' }
        : { to: '/privacy', label: 'Privacy Policy' };

    return (
        <div className="min-h-screen bg-[#f7f8f6] text-gray-900 font-sans">
            {/* Public page: a light header that works signed in or out */}
            <nav className="flex items-center justify-between px-6 py-4 md:px-12 bg-[#d8e2d3]">
                <Link to="/" className="flex items-center gap-2 text-[#1f382a]">
                    <Beaker size={24} aria-hidden />
                    <span className="text-xl font-bold tracking-tight">Formularium</span>
                </Link>
                <div className="flex gap-6 text-sm font-medium text-[#2c4c3b]">
                    <Link to="/blog" className="hover:text-black">Blog</Link>
                    <Link to="/learn" className="hover:text-black">Learn</Link>
                </div>
            </nav>

            <main className="max-w-6xl mx-auto px-6 py-10 lg:grid lg:grid-cols-[1fr_15rem] lg:gap-12">
                <article className="min-w-0 max-w-3xl">
                    <h1 className="text-3xl md:text-4xl font-bold text-[#1f382a] mb-2">{document.title}</h1>
                    <p className="text-sm text-gray-500 mb-8">
                        Last updated: <time dateTime={LEGAL.lastUpdated}>{formatDate(LEGAL.lastUpdated)}</time>
                    </p>

                    <section aria-labelledby="summary" className="bg-white border border-[#c1d1b9] rounded-2xl p-6 mb-8">
                        <h2 id="summary" className="font-bold text-[#1f382a] mb-3">In short</h2>
                        <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
                            {document.summary.map(point => (
                                <li key={point} className="flex gap-2">
                                    <span className="text-[#2c4c3b] font-bold" aria-hidden>✓</span>
                                    <span><RichText text={point} /></span>
                                </li>
                            ))}
                        </ul>
                        <p className="text-xs text-gray-500 mt-4">This summary is for convenience; the full text below is what applies.</p>
                    </section>

                    <ArticleBody blocks={document.body} />

                    <p className="mt-10 pt-6 border-t border-gray-200 text-sm text-gray-600">
                        See also our <Link to={other.to} className="font-medium text-[#2c4c3b] underline">{other.label}</Link>.
                    </p>
                </article>

                <aside className="hidden lg:block">
                    <nav aria-label="Sections" className="sticky top-6 bg-white border border-[#c1d1b9] rounded-2xl p-5">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Sections</h2>
                        <ul className="space-y-2 text-sm">
                            {sections.map(text => (
                                <li key={text}>
                                    <a href={`#${headingId(text)}`} className="text-gray-600 hover:text-[#2c4c3b] hover:underline leading-snug block">{text}</a>
                                </li>
                            ))}
                        </ul>
                    </nav>
                </aside>
            </main>
        </div>
    );
}
