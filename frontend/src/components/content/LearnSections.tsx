import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, ChevronDown } from 'lucide-react';
import { DataTable, RichText } from './ArticleBody';
import { CHEAT_SHEETS, LEARNING_PATH, SAFETY_CHECKLIST } from '../../content/learn';
import type { CheatSheet, FaqItem, GlossaryEntry, TroubleshootingItem } from '../../content/types';

// ---------- Percent -> grams ----------

const COMMON_PERCENTAGES = [0.1, 0.5, 1, 2, 3, 5, 10, 20];
const fmt = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : '-');

export function PercentCalculator() {
    const [batch, setBatch] = useState('100');
    const [pct, setPct] = useState('2');
    const batchG = parseFloat(batch);
    const grams = (batchG * parseFloat(pct)) / 100;

    return (
        <section aria-labelledby="calc-title" className="bg-white border border-[#c1d1b9] rounded-2xl p-6">
            <h3 id="calc-title" className="font-bold text-[#1f382a] mb-1">Percent to grams</h3>
            <p className="text-sm text-gray-500 mb-4">Formulas are written in percentages. Enter your batch size to see how much to weigh.</p>
            <div className="flex flex-wrap items-end gap-4 mb-5">
                <label className="text-sm">
                    <span className="block font-medium text-gray-700 mb-1">Batch size (g)</span>
                    <input type="number" min="0" step="any" value={batch} onChange={(e) => setBatch(e.target.value)}
                        className="w-28 border border-[#c1d1b9] rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#2c4c3b]" />
                </label>
                <label className="text-sm">
                    <span className="block font-medium text-gray-700 mb-1">Percentage (%)</span>
                    <input type="number" min="0" step="any" value={pct} onChange={(e) => setPct(e.target.value)}
                        className="w-28 border border-[#c1d1b9] rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#2c4c3b]" />
                </label>
                <div className="text-sm pb-2" aria-live="polite">
                    <span className="text-gray-500">= </span>
                    <span className="text-2xl font-bold text-[#1f382a]">{fmt(grams)} g</span>
                </div>
            </div>
            <div className="flex flex-wrap gap-2">
                {COMMON_PERCENTAGES.map(p => (
                    <span key={p} className="text-xs bg-[#f3f5f2] border border-gray-200 rounded-full px-3 py-1 text-gray-600">
                        <strong className="text-[#1f382a]">{p}%</strong> = {fmt((batchG * p) / 100)} g
                    </span>
                ))}
            </div>
        </section>
    );
}

// ---------- Start here ----------

export function StartSection() {
    return (
        <div className="space-y-10">
            <ol className="space-y-4">
                {LEARNING_PATH.map((step, i) => (
                    <li key={step.title} className="flex gap-4 bg-white border border-[#c1d1b9] rounded-2xl p-5">
                        <span className="shrink-0 w-9 h-9 rounded-full bg-[#2c4c3b] text-white flex items-center justify-center font-bold" aria-hidden>{i + 1}</span>
                        <div>
                            <h3 className="font-bold text-[#1f382a] mb-1">{step.title}</h3>
                            <p className="text-sm text-gray-600 leading-relaxed mb-3">{step.text}</p>
                            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                                {step.links.map(l => (
                                    <Link key={l.to} to={l.to} className="font-bold text-[#2c4c3b] hover:underline inline-flex items-center gap-1">
                                        {l.label} <ArrowRight size={14} />
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </li>
                ))}
            </ol>
            <PercentCalculator />
        </div>
    );
}

// ---------- Glossary ----------

export function GlossarySection({ entries, showIndex = true }: { entries: GlossaryEntry[]; showIndex?: boolean }) {
    const letterOf = (term: string) => term.charAt(0).toUpperCase();
    const letters = [...new Set(entries.map(e => letterOf(e.term)))];

    return (
        <div>
            {showIndex && letters.length > 1 && (
                <nav aria-label="Jump to letter" className="flex flex-wrap gap-1 mb-6">
                    {letters.map(l => (
                        <a key={l} href={`#glossary-${l}`} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-[#c1d1b9] text-sm font-bold text-[#2c4c3b] hover:bg-[#e9eee7]">{l}</a>
                    ))}
                </nav>
            )}
            <dl className="space-y-3">
                {entries.map((entry, i) => {
                    const isFirstOfLetter = i === 0 || letterOf(entries[i - 1].term) !== letterOf(entry.term);
                    return (
                        <div key={entry.term} id={isFirstOfLetter ? `glossary-${letterOf(entry.term)}` : undefined} className="scroll-mt-24 bg-white border border-gray-200 rounded-xl p-4">
                            <dt className="font-bold text-[#1f382a]">{entry.term}</dt>
                            <dd className="text-sm text-gray-600 leading-relaxed mt-1">
                                {entry.definition}
                                {entry.article && (
                                    <> <Link to={`/blog/${entry.article}`} className="font-medium text-[#2c4c3b] hover:underline whitespace-nowrap">Read more &rarr;</Link></>
                                )}
                            </dd>
                        </div>
                    );
                })}
            </dl>
        </div>
    );
}

// ---------- Cheat sheets ----------

export function CheatSheetsSection({ sheets = CHEAT_SHEETS }: { sheets?: CheatSheet[] }) {
    return (
        <div className="space-y-10">
            {sheets.map(sheet => (
                <section key={sheet.id} id={sheet.id} className="scroll-mt-24">
                    <h3 className="text-xl font-bold text-[#1f382a]">{sheet.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{sheet.intro}</p>
                    <DataTable headers={sheet.headers} rows={sheet.rows} />
                    {sheet.note && <p className="text-xs text-gray-500 italic -mt-3">{sheet.note}</p>}
                </section>
            ))}
        </div>
    );
}

// ---------- Troubleshooting ----------

export function TroubleshootingSection({ items }: { items: TroubleshootingItem[] }) {
    return (
        <div className="space-y-3">
            {items.map(item => (
                <details key={item.id} className="group bg-white border border-[#c1d1b9] rounded-xl overflow-hidden">
                    <summary className="cursor-pointer list-none flex items-center justify-between gap-4 p-4 font-bold text-[#1f382a] hover:bg-[#f7f8f6] [&::-webkit-details-marker]:hidden">
                        {item.problem}
                        <ChevronDown size={18} className="shrink-0 text-gray-400 transition-transform group-open:rotate-180" aria-hidden />
                    </summary>
                    <div className="grid md:grid-cols-2 gap-6 p-5 border-t border-gray-100 text-sm">
                        <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-2">Likely causes</h4>
                            <ul className="list-disc pl-5 space-y-1.5 text-gray-700 marker:text-amber-400">
                                {item.causes.map(c => <li key={c}>{c}</li>)}
                            </ul>
                        </div>
                        <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-[#2c4c3b] mb-2">What to try</h4>
                            <ul className="space-y-1.5 text-gray-700">
                                {item.fixes.map(f => (
                                    <li key={f} className="flex gap-2"><Check size={16} className="text-[#2c4c3b] shrink-0 mt-0.5" aria-hidden /><span>{f}</span></li>
                                ))}
                            </ul>
                        </div>
                        {item.article && (
                            <div className="md:col-span-2">
                                <Link to={`/blog/${item.article}`} className="font-bold text-[#2c4c3b] hover:underline">Read the full guide &rarr;</Link>
                            </div>
                        )}
                    </div>
                </details>
            ))}
        </div>
    );
}

// ---------- Safety ----------

export function SafetySection() {
    return (
        <div className="space-y-8">
            <div className="grid md:grid-cols-2 gap-5">
                {SAFETY_CHECKLIST.map(group => (
                    <section key={group.title} className="bg-white border border-[#c1d1b9] rounded-2xl p-5">
                        <h3 className="font-bold text-[#1f382a] mb-3">{group.title}</h3>
                        <ul className="space-y-2 text-sm text-gray-700">
                            {group.items.map(item => (
                                <li key={item} className="flex gap-2"><Check size={16} className="text-[#2c4c3b] shrink-0 mt-0.5" aria-hidden /><span>{item}</span></li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
            <aside className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-900">
                <h3 className="font-bold mb-1">Thinking of selling?</h3>
                <p>
                    Making products for yourself and selling them are very different. Selling normally requires a documented safety assessment and correct labelling, and the rules vary by country.{' '}
                    <Link to="/blog/selling-your-formulas" className="font-bold underline">Read the basics</Link>.
                </p>
            </aside>
        </div>
    );
}

// ---------- FAQ ----------

export function FaqSection({ items }: { items: FaqItem[] }) {
    return (
        <div className="space-y-3">
            {items.map(item => (
                <details key={item.q} className="group bg-white border border-[#c1d1b9] rounded-xl overflow-hidden">
                    <summary className="cursor-pointer list-none flex items-center justify-between gap-4 p-4 font-bold text-[#1f382a] hover:bg-[#f7f8f6] [&::-webkit-details-marker]:hidden">
                        {item.q}
                        <ChevronDown size={18} className="shrink-0 text-gray-400 transition-transform group-open:rotate-180" aria-hidden />
                    </summary>
                    <p className="px-5 pb-5 pt-1 text-sm text-gray-600 leading-relaxed border-t border-gray-100"><RichText text={item.a} /></p>
                </details>
            ))}
        </div>
    );
}
