import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Info, Lightbulb, TriangleAlert } from 'lucide-react';
import type { Block } from '../../content/types';
import { headingId } from '../../content/helpers';

const INLINE = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/;
const LINK = /^\[([^\]]+)\]\(([^)]+)\)$/;

/** Renders **bold** and [links](/path) without ever touching innerHTML. */
export function RichText({ text }: { text: string }) {
    return (
        <>
            {text.split(INLINE).map((part, i) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={i} className="font-semibold text-[#1f382a]">{part.slice(2, -2)}</strong>;
                }
                const link = LINK.exec(part);
                if (link) {
                    const [, label, href] = link;
                    const className = 'font-medium text-[#2c4c3b] underline decoration-[#c1d1b9] underline-offset-2 hover:decoration-[#2c4c3b]';
                    return href.startsWith('/')
                        ? <Link key={i} to={href} className={className}>{label}</Link>
                        : <a key={i} href={href} target="_blank" rel="noopener noreferrer" className={className}>{label}</a>;
                }
                return <Fragment key={i}>{part}</Fragment>;
            })}
        </>
    );
}

const CALLOUT = {
    tip: { icon: Lightbulb, box: 'bg-[#f0f6ee] border-[#b9ccb2]', accent: 'text-[#2c4c3b]' },
    warning: { icon: TriangleAlert, box: 'bg-amber-50 border-amber-200', accent: 'text-amber-800' },
    info: { icon: Info, box: 'bg-sky-50 border-sky-200', accent: 'text-sky-800' },
} as const;

export function Callout({ tone, title, text }: { tone: keyof typeof CALLOUT; title: string; text: string }) {
    const { icon: Icon, box, accent } = CALLOUT[tone];
    return (
        <aside className={`my-6 rounded-xl border p-4 flex gap-3 ${box}`}>
            <Icon size={20} className={`${accent} shrink-0 mt-0.5`} aria-hidden />
            <div className="text-sm leading-relaxed text-gray-700">
                <p className={`font-bold mb-1 ${accent}`}>{title}</p>
                <p><RichText text={text} /></p>
            </div>
        </aside>
    );
}

export function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
    return (
        <div className="my-6 overflow-x-auto rounded-xl border border-[#c1d1b9] bg-white">
            <table className="w-full text-left text-sm border-collapse min-w-[480px]">
                <thead>
                    <tr className="bg-[#e9eee7] text-[#1f382a]">
                        {headers.map(h => <th key={h} className="px-4 py-2.5 font-bold text-xs uppercase tracking-wide">{h}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, r) => (
                        <tr key={r} className="border-t border-gray-100 align-top odd:bg-white even:bg-[#f9faf8]">
                            {row.map((cell, c) => (
                                <td key={c} className={`px-4 py-2.5 ${c === 0 ? 'font-semibold text-[#1f382a]' : 'text-gray-700'}`}>
                                    <RichText text={cell} />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

const PHASE_BG = ['bg-[#cbd8d0]', 'bg-[#e6e1cd]', 'bg-[#bdcdbd]'];

function Recipe({ block }: { block: Extract<Block, { type: 'recipe' }> }) {
    return (
        <figure className="my-6 rounded-xl border border-[#c1d1b9] bg-white overflow-hidden">
            <figcaption className="bg-[#1f382a] text-white px-4 py-3 flex justify-between items-baseline gap-3">
                <span className="font-bold">{block.title}</span>
                <span className="text-xs text-[#c1d1b9]">{block.batch}</span>
            </figcaption>
            {block.phases.map((phase, i) => (
                <div key={phase.name}>
                    <div className={`${PHASE_BG[i % PHASE_BG.length]} px-4 py-2 text-sm font-bold text-[#1f382a]`}>{phase.name}</div>
                    <ul className="divide-y divide-gray-100">
                        {phase.items.map(item => (
                            <li key={item.name} className="px-4 py-2.5 flex items-baseline justify-between gap-4 text-sm">
                                <span>
                                    <span className="font-medium text-gray-900">{item.name}</span>
                                    {item.note && <span className="block text-xs text-gray-500">{item.note}</span>}
                                </span>
                                <span className="font-mono font-semibold text-[#1f382a] whitespace-nowrap">{item.pct}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </figure>
    );
}

export default function ArticleBody({ blocks }: { blocks: Block[] }) {
    return (
        <div>
            {blocks.map((block, i) => {
                switch (block.type) {
                    case 'h2':
                        return <h2 key={i} id={headingId(block.text)} className="scroll-mt-24 text-2xl font-bold text-[#1f382a] mt-10 mb-3">{block.text}</h2>;
                    case 'h3':
                        return <h3 key={i} className="text-lg font-bold text-[#1f382a] mt-6 mb-2">{block.text}</h3>;
                    case 'p':
                        return <p key={i} className="text-gray-700 leading-relaxed mb-4"><RichText text={block.text} /></p>;
                    case 'ul':
                        return (
                            <ul key={i} className="list-disc pl-6 mb-4 space-y-1.5 text-gray-700 leading-relaxed marker:text-[#8ca89b]">
                                {block.items.map((item, j) => <li key={j}><RichText text={item} /></li>)}
                            </ul>
                        );
                    case 'ol':
                        return (
                            <ol key={i} className="list-decimal pl-6 mb-4 space-y-2 text-gray-700 leading-relaxed marker:font-bold marker:text-[#2c4c3b]">
                                {block.items.map((item, j) => <li key={j}><RichText text={item} /></li>)}
                            </ol>
                        );
                    case 'callout':
                        return <Callout key={i} tone={block.tone} title={block.title} text={block.text} />;
                    case 'table':
                        return <DataTable key={i} headers={block.headers} rows={block.rows} />;
                    case 'recipe':
                        return <Recipe key={i} block={block} />;
                }
            })}
        </div>
    );
}
