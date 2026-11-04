import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { usePageTitle } from '../components/content/usePageTitle';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { parseRecipeText, type ParsedLine } from '../lib/recipeParser';
import type { Confidence, MatchCandidate } from '../lib/ingredientMatcher';
import { matchLine, suggestByRole } from '../lib/lineMatching';
import { loadImportCandidates, MAX_IMPORT_LINES, type LibraryRow } from '../lib/importCandidates';
import { buildImportedFormula, type ImportLine } from '../lib/importFormula';
import { saveImport } from '../lib/importHandoff';
import type { ProfileConfig } from '../types/formulation';

const EXAMPLE = `Phase A
Water q.s. to 100
Glycerin 4%
Panthenol 1%
Phase B
Jojoba oil 8%
Shea butter 4%
Cetyl alcohol 2%
Olivem 1000 4%
Phase C
Vitamin E 0.5%
Phenoxyethanol + ethylhexylglycerin 1%`;

const PRODUCT_TYPES: { id: string; label: string }[] = [
    { id: 'ow_lotion', label: 'O/W Lotion or Cream' }, { id: 'wo_cream', label: 'W/O Rich Cream or Salve' },
    { id: 'body_butter', label: 'Body Butter or Balm' }, { id: 'facial_oil', label: 'Facial or Body Oil' },
    { id: 'toner_mist', label: 'Toner or Face Mist' }, { id: 'water_serum', label: 'Water-based Serum or Gel' },
    { id: 'body_wash', label: 'Body Wash or Gel Cleanser' }, { id: 'shampoo', label: 'Shampoo' },
];

const CONFIDENCE_STYLE: Record<Confidence, { label: string; className: string }> = {
    exact: { label: 'Exact match', className: 'bg-green-50 text-green-800 border-green-200' },
    likely: { label: 'Likely match', className: 'bg-blue-50 text-blue-800 border-blue-200' },
    possible: { label: 'Check this', className: 'bg-amber-50 text-amber-900 border-amber-200' },
};
const SOURCE_LABEL: Record<string, string> = { pasted: '', weight: 'from weight', range: 'middle of range', remainder: 'the rest', suggested: 'suggested', edited: 'edited' };

/** A library ingredient for a line; `suggestedFor` is set when it was offered for the kind of ingredient asked for, not found by name. */
type Candidate = MatchCandidate<LibraryRow> & { suggestedFor?: string };

interface Analysis {
    parsed: ParsedLine[];
    ignored: string[];
    candidates: Candidate[][];
}
interface LineChoice {
    /** The chosen library row, or null to skip the line. */
    rowId: string | null;
    pct: string;
    phase: '' | 'A' | 'B' | 'C';
}

const displayName = (row: LibraryRow) => (row.trade_name && row.trade_name !== row.inci_name ? `${row.trade_name} (${row.inci_name})` : row.inci_name);

export default function ImportFormulaPage() {
    usePageTitle('Import a formula');
    const navigate = useNavigate();
    const { user } = useAuth();

    const [text, setText] = useState('');
    const [analysis, setAnalysis] = useState<Analysis | null>(null);
    const [choices, setChoices] = useState<LineChoice[]>([]);
    const [productType, setProductType] = useState('');
    const [name, setName] = useState('Imported formula');
    const [isWorking, setIsWorking] = useState(false);
    const [error, setError] = useState('');

    const analyse = async () => {
        if (!user) return;
        setError('');
        const result = parseRecipeText(text);
        if (result.lines.length === 0) return setError('We could not find any ingredients in that text. Paste a list with one ingredient per line, for example "Water 70%".');
        if (result.lines.length > MAX_IMPORT_LINES) return setError(`That is more than ${MAX_IMPORT_LINES} lines. Paste just the ingredient list.`);

        setIsWorking(true);
        try {
            const { rows, stashIds } = await loadImportCandidates(result.lines, user.id);
            const candidates: Candidate[][] = result.lines.map(line => {
                const named: Candidate[] = matchLine(line, rows, { stashIds });
                // A line such as "Fragrance" or "Humectant" with nothing sure found by name gets the library's ingredients of that kind to pick from
                const sure = named.some(c => c.confidence !== 'possible');
                const suggestions = sure ? [] : suggestByRole(line, rows, { stashIds }).filter(s => !named.some(c => c.row.id === s.row.id));
                return [...named, ...suggestions];
            });
            setAnalysis({ parsed: result.lines, ignored: result.ignored, candidates });
            // Sure matches are chosen for the person; weaker ones are left for them to confirm
            setChoices(candidates.map(list => ({ rowId: list[0] && list[0].confidence !== 'possible' ? list[0].row.id : null, pct: '', phase: '' })));
        } catch (err) {
            console.error('Could not look up the ingredients:', err);
            setError('We could not look up your ingredient library just now. Please try again.');
        } finally {
            setIsWorking(false);
        }
    };

    const lines: ImportLine<LibraryRow>[] = useMemo(() => {
        if (!analysis) return [];
        return analysis.parsed.map((parsed, i) => {
            const choice = choices[i];
            const row = analysis.candidates[i].find(c => c.row.id === choice?.rowId)?.row ?? null;
            const pct = choice?.pct.trim() === '' ? null : Number(choice?.pct);
            return { parsed, row, overridePct: pct != null && Number.isFinite(pct) && pct >= 0 ? pct : null, overridePhase: choice?.phase || undefined };
        });
    }, [analysis, choices]);

    const formula = useMemo(() => buildImportedFormula(lines, productType || null), [lines, productType]);
    const matchedCount = lines.filter(l => l.row).length;
    const total = formula.ingredients.reduce((s, i) => s + i.percentage, 0);

    const update = (i: number, change: Partial<LineChoice>) => setChoices(prev => prev.map((c, k) => (k === i ? { ...c, ...change } : c)));

    const create = async () => {
        if (formula.ingredients.length === 0) return;
        setIsWorking(true);
        setError('');
        try {
            const { data } = await supabase.from('formulation_profiles').select('*').eq('id', formula.profileId).maybeSingle();
            const skipped = lines.filter(l => !l.row).map(l => l.parsed.name);
            const saved = saveImport({
                name: name.trim() || 'Imported formula',
                profileId: formula.profileId,
                profile: (data as ProfileConfig | null) ?? null,
                targetWeight: 100,
                ingredients: formula.ingredients as unknown as Record<string, unknown>[],
                warnings: formula.warnings,
                skipped,
            });
            if (!saved) return setError('Your browser would not let us hand the formula to the Studio. Please allow site storage and try again.');
            navigate('/studio/new?import=1');
        } finally {
            setIsWorking(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f7f8f6] text-gray-900 font-sans">
            <Header title="Import a formula" backPath="/studio/start" backLabel="Back" />

            <main className="max-w-5xl mx-auto px-6 py-10">
                <h1 className="text-3xl font-bold text-[#1f382a] mb-2">Paste a formula</h1>
                <p className="text-gray-600 mb-6 max-w-2xl">
                    Paste a recipe or an ingredient list from anywhere. We match each ingredient to your library and fill in the table, and you check it before it reaches the Studio.
                </p>

                {error && <div role="alert" className="mb-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium">{error}</div>}

                {!analysis ? (
                    <section aria-label="Paste your formula" className="bg-white border border-[#c1d1b9] rounded-2xl p-6">
                        <label htmlFor="import-text" className="block text-sm font-bold text-gray-700 mb-2">Your formula</label>
                        <textarea
                            id="import-text"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder={'Water 70%\nGlycerin 5%\nCetyl alcohol 3%\n...'}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm font-mono min-h-[260px] resize-y"
                        />
                        <p className="text-xs text-gray-500 mt-2">
                            Works with percentages (70%), weights (5 g), &quot;q.s.&quot;, phase headings (Phase A), or just an ingredient list in any order.
                            Without amounts, we suggest sensible ones.
                        </p>
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <button onClick={analyse} disabled={!text.trim() || isWorking} className="px-6 py-2.5 bg-[#2c4c3b] text-white text-sm font-bold rounded-lg hover:bg-[#1f382a] disabled:opacity-50">
                                {isWorking ? 'Matching...' : 'Find ingredients'}
                            </button>
                            <button onClick={() => setText(EXAMPLE)} type="button" className="text-sm font-semibold text-[#2c4c3b] underline">Try an example</button>
                        </div>
                    </section>
                ) : (
                    <section aria-label="Check the ingredients" className="space-y-5">
                        <p role="status" aria-label="Match summary" className="text-sm text-gray-700">
                            Matched <strong>{matchedCount}</strong> of <strong>{lines.length}</strong> lines to your library.
                            {matchedCount < lines.length && ' Choose a match for the others, or leave them out.'}
                        </p>

                        <div className="bg-white border border-[#c1d1b9] rounded-2xl overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-[#f0f4ef] text-[#3a5a4a] text-xs uppercase">
                                    <tr>
                                        <th className="px-4 py-3 text-left">You pasted</th>
                                        <th className="px-4 py-3 text-left">Ingredient in your library</th>
                                        <th className="px-4 py-3 text-right w-32">Amount %</th>
                                        <th className="px-4 py-3 text-center w-24">Phase</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {lines.map((line, i) => {
                                        const candidates = analysis.candidates[i];
                                        const chosen = candidates.find(c => c.row.id === choices[i]?.rowId);
                                        const at = formula.lineIndexes.indexOf(i);
                                        const built = at >= 0 ? formula.ingredients[at] : null;
                                        const source = at >= 0 ? SOURCE_LABEL[formula.sources[at]] : '';
                                        return (
                                            <tr key={i} className={line.row ? '' : 'bg-amber-50/40'}>
                                                <td className="px-4 py-3 align-top">
                                                    <div className="font-medium text-gray-900">{line.parsed.name}</div>
                                                    <div className="text-[11px] text-gray-400 font-mono">{line.parsed.raw}</div>
                                                    {line.parsed.examples.length > 0 && <div className="text-[11px] text-gray-500 mt-0.5">Examples given: {line.parsed.examples.join(', ')}</div>}
                                                    {line.parsed.optional && <span className="inline-block mt-0.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-sm bg-gray-100 text-gray-500">Optional</span>}
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    <select
                                                        aria-label={`Ingredient for ${line.parsed.name}`}
                                                        value={choices[i]?.rowId ?? ''}
                                                        onChange={(e) => update(i, { rowId: e.target.value || null })}
                                                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
                                                    >
                                                        <option value="">{candidates.length ? '— Leave this one out —' : '— Not found in your library —'}</option>
                                                        {candidates.filter(c => !c.suggestedFor).map(c => <option key={c.row.id} value={c.row.id}>{displayName(c.row)}</option>)}
                                                        {candidates.some(c => c.suggestedFor) && (
                                                            <optgroup label={`Suggestions: ${candidates.find(c => c.suggestedFor)?.suggestedFor}`}>
                                                                {candidates.filter(c => c.suggestedFor).map(c => <option key={c.row.id} value={c.row.id}>{displayName(c.row)}</option>)}
                                                            </optgroup>
                                                        )}
                                                    </select>
                                                    {chosen ? (
                                                        <span className={`inline-block mt-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-sm border ${CONFIDENCE_STYLE[chosen.confidence].className}`}>{CONFIDENCE_STYLE[chosen.confidence].label}</span>
                                                    ) : candidates.length > 0 ? (
                                                        <span className={`inline-block mt-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-sm border ${CONFIDENCE_STYLE.possible.className}`}>Check this</span>
                                                    ) : null}
                                                </td>
                                                <td className="px-4 py-3 align-top text-right">
                                                    {line.row ? (
                                                        <>
                                                            <input
                                                                type="number" min={0} step="0.01"
                                                                aria-label={`Amount for ${line.parsed.name}`}
                                                                value={choices[i]?.pct !== '' ? choices[i].pct : (built ? String(built.percentage) : '')}
                                                                onChange={(e) => update(i, { pct: e.target.value })}
                                                                className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm text-right font-mono"
                                                            />
                                                            {line.parsed.amount?.range && <div className="text-[10px] text-gray-400 mt-0.5">pasted {line.parsed.amount.range[0]}–{line.parsed.amount.range[1]}%</div>}
                                                            {source && <div className="text-[10px] text-gray-400 mt-0.5">{source}</div>}
                                                        </>
                                                    ) : <span className="text-gray-300">—</span>}
                                                </td>
                                                <td className="px-4 py-3 align-top text-center">
                                                    {line.row ? (
                                                        <select
                                                            aria-label={`Phase for ${line.parsed.name}`}
                                                            value={choices[i]?.phase || built?.phase || 'A'}
                                                            onChange={(e) => update(i, { phase: e.target.value as 'A' | 'B' | 'C' })}
                                                            className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
                                                        >
                                                            {(['A', 'B', 'C'] as const).map(p => <option key={p} value={p}>{p}</option>)}
                                                        </select>
                                                    ) : <span className="text-gray-300">—</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-[#f0f4ef] text-[#1f382a] font-bold">
                                        <td className="px-4 py-2" colSpan={2}>Total</td>
                                        <td className="px-4 py-2 text-right font-mono">{Math.round(total * 100) / 100}%</td>
                                        <td />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {analysis.ignored.length > 0 && (
                            <p className="text-xs text-gray-500">Not treated as ingredients: {analysis.ignored.map(l => `"${l.length > 60 ? `${l.slice(0, 60)}…` : l}"`).join(', ')}</p>
                        )}
                        {formula.warnings.length > 0 && (
                            <ul role="status" className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 list-disc pl-8">
                                {formula.warnings.map(w => <li key={w}>{w}</li>)}
                            </ul>
                        )}

                        <div className="bg-white border border-[#c1d1b9] rounded-2xl p-5 grid gap-4 sm:grid-cols-2">
                            <div>
                                <label htmlFor="import-name" className="block text-sm font-bold text-gray-700 mb-1">Formula name</label>
                                <input id="import-name" value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                            </div>
                            <div>
                                <label htmlFor="import-type" className="block text-sm font-bold text-gray-700 mb-1">Product type</label>
                                <select id="import-type" value={productType || formula.profileId} onChange={(e) => setProductType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                                    {PRODUCT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <button onClick={create} disabled={formula.ingredients.length === 0 || isWorking} className="px-6 py-2.5 bg-[#2c4c3b] text-white text-sm font-bold rounded-lg hover:bg-[#1f382a] disabled:opacity-50">
                                {isWorking ? 'Creating...' : 'Create formula in Studio'}
                            </button>
                            <button onClick={() => { setAnalysis(null); setError(''); }} className="text-sm font-semibold text-gray-600 underline">Edit the pasted text</button>
                        </div>
                    </section>
                )}

                <p className="text-xs text-gray-500 mt-8">
                    Imported formulas are a starting point. We cannot know whether a pasted recipe is safe: check the alerts, measure the pH, and test a small batch first.
                </p>
            </main>
        </div>
    );
}
