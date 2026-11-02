import { Link } from 'react-router-dom';
import { ArrowRight, Clock, Droplets, FlaskConical, ShieldCheck, Thermometer } from 'lucide-react';
import type { Article, ArticleCategory } from '../../content/types';
import { CATEGORY_STYLE, readingMinutes } from '../../content/helpers';
import { useSettings } from '../../contexts/SettingsContext';

const CATEGORY_ICON: Record<ArticleCategory, typeof Clock> = {
    'Getting started': FlaskConical,
    'Ingredients': Droplets,
    'Techniques': Thermometer,
    'Safety': ShieldCheck,
};

export function CategoryBadge({ category }: { category: ArticleCategory }) {
    return (
        <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${CATEGORY_STYLE[category].badge}`}>
            {category}
        </span>
    );
}

function Cover({ category, large }: { category: ArticleCategory; large?: boolean }) {
    const Icon = CATEGORY_ICON[category];
    return (
        <div className={`bg-gradient-to-br ${CATEGORY_STYLE[category].cover} flex items-center justify-center text-[#2c4c3b]/60 ${large ? 'h-full min-h-[200px]' : 'h-40'}`}>
            <Icon size={large ? 64 : 44} strokeWidth={1.5} aria-hidden />
        </div>
    );
}

export default function ArticleCard({ article, featured = false }: { article: Article; featured?: boolean }) {
    const { formatDate } = useSettings();
    const meta = (
        <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>{formatDate(article.publishedAt)}</span>
            <span className="flex items-center gap-1"><Clock size={12} aria-hidden /> {readingMinutes(article)} min read</span>
            <span>{article.level}</span>
        </div>
    );

    if (featured) {
        return (
            <Link to={`/blog/${article.slug}`} className="group grid md:grid-cols-2 bg-white border border-[#c1d1b9] rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <Cover category={article.category} large />
                <div className="p-8 flex flex-col justify-center gap-3">
                    <div className="flex items-center gap-2">
                        <CategoryBadge category={article.category} />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Featured</span>
                    </div>
                    <h2 className="text-2xl md:text-3xl font-bold text-[#1f382a] leading-tight group-hover:text-[#2c4c3b] group-hover:underline decoration-[#c1d1b9] underline-offset-4">
                        {article.title}
                    </h2>
                    <p className="text-gray-600 leading-relaxed">{article.excerpt}</p>
                    {meta}
                    <span className="inline-flex items-center gap-1 text-sm font-bold text-[#2c4c3b]">Read the article <ArrowRight size={16} /></span>
                </div>
            </Link>
        );
    }

    return (
        <Link to={`/blog/${article.slug}`} className="group flex flex-col bg-white border border-[#c1d1b9] rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow h-full">
            <Cover category={article.category} />
            <div className="p-5 flex flex-col gap-2 flex-1">
                <CategoryBadge category={article.category} />
                <h3 className="text-lg font-bold text-[#1f382a] leading-snug group-hover:text-[#2c4c3b] group-hover:underline decoration-[#c1d1b9] underline-offset-4">
                    {article.title}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">{article.excerpt}</p>
                <div className="mt-auto pt-2">{meta}</div>
            </div>
        </Link>
    );
}
