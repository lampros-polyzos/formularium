import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardPaste, FilePlus2 } from 'lucide-react';
import Header from '../components/Header';
import { usePageTitle } from '../components/content/usePageTitle';
import { STARTER_TEMPLATES } from '../lib/starterTemplates';

const LEVEL_STYLE: Record<string, string> = {
    'Easiest': 'bg-green-50 text-green-800 border-green-200',
    'Easy': 'bg-blue-50 text-blue-800 border-blue-200',
    'A bit more involved': 'bg-amber-50 text-amber-800 border-amber-200',
};

export default function StartPage() {
    usePageTitle('New formula');

    return (
        <div className="min-h-screen bg-[#f7f8f6] text-gray-900 font-sans">
            <Header title="New formula" backPath="/studio" backLabel="Back to Studio" />

            <main className="max-w-5xl mx-auto px-6 py-10">
                <h1 className="text-3xl font-bold text-[#1f382a] mb-2">What are you making?</h1>
                <p className="text-gray-600 mb-8 max-w-2xl">
                    Pick a starting point and we will fill in a sensible, balanced formula from your ingredient library. You can change anything afterwards.
                </p>

                <div className="grid gap-5 sm:grid-cols-2">
                    {STARTER_TEMPLATES.map(template => (
                        <Link
                            key={template.id}
                            to={`/studio/new?template=${template.id}`}
                            className="group bg-white border border-[#c1d1b9] rounded-2xl p-6 flex flex-col hover:shadow-md hover:border-[#2c4c3b] transition-all focus:outline-none focus:ring-2 focus:ring-[#2c4c3b]"
                        >
                            <div className="flex items-start justify-between gap-3 mb-1">
                                <h2 className="text-xl font-bold text-[#1f382a]">{template.name}</h2>
                                <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-sm border ${LEVEL_STYLE[template.level]}`}>{template.level}</span>
                            </div>
                            <p className="text-sm text-gray-600 mb-4">{template.tagline}</p>
                            <ul className="flex flex-wrap gap-1.5 mb-5" aria-label={`${template.name} contains`}>
                                {template.includes.map(item => (
                                    <li key={item} className="text-xs bg-[#e9eee7] text-[#2c4c3b] px-2 py-0.5 rounded-full">{item}</li>
                                ))}
                            </ul>
                            <span className="mt-auto text-sm font-bold text-[#2c4c3b] inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                                Start with this <ArrowRight size={14} aria-hidden />
                            </span>
                        </Link>
                    ))}
                </div>

                <Link
                    to="/studio/import"
                    className="mt-6 flex items-center gap-3 bg-white border border-[#c1d1b9] rounded-2xl p-5 hover:border-[#2c4c3b] hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-[#2c4c3b]"
                >
                    <ClipboardPaste size={22} className="text-[#2c4c3b] shrink-0" aria-hidden />
                    <span>
                        <span className="block font-bold text-[#1f382a]">Paste a formula</span>
                        <span className="block text-sm text-gray-600">Paste a recipe or ingredient list from anywhere and we match it to your library.</span>
                    </span>
                </Link>

                <Link
                    to="/studio/new"
                    className="mt-4 flex items-center gap-3 bg-white border border-dashed border-[#c1d1b9] rounded-2xl p-5 hover:border-[#2c4c3b] transition-colors focus:outline-none focus:ring-2 focus:ring-[#2c4c3b]"
                >
                    <FilePlus2 size={22} className="text-[#2c4c3b] shrink-0" aria-hidden />
                    <span>
                        <span className="block font-bold text-[#1f382a]">Something else, or start from scratch</span>
                        <span className="block text-sm text-gray-600">An empty formula: choose a product type and add ingredients yourself.</span>
                    </span>
                </Link>

                <p className="text-xs text-gray-500 mt-8">
                    Templates are a starting point, not a tested recipe. Check the alerts, measure the pH, and test a small batch first.
                </p>
            </main>
        </div>
    );
}
