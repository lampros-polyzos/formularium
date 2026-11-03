import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, Printer } from 'lucide-react';
import StudioLayout from '../components/StudioLayout';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useShoppingData } from '../hooks/useShoppingData';
import { buildShoppingList, type AlertKind, type ShoppingItem, type StashAlert, type Usage } from '../lib/shoppingList';
import { displayName } from '../lib/substitutions';

const grams = (g: number) => `${Number(g.toFixed(2))} g`;

const ALERT_STYLE: Record<AlertKind, string> = {
    expired: 'border-red-300 bg-red-50 text-red-900',
    expiring: 'border-orange-300 bg-orange-50 text-orange-900',
    low: 'border-amber-300 bg-amber-50 text-amber-900',
    'low-after': 'border-blue-300 bg-blue-50 text-blue-900',
};
const ALERT_BADGE: Record<AlertKind, string> = { expired: 'Expired', expiring: 'Expiring soon', low: 'Low stock', 'low-after': 'Will run low' };

function alertText(a: StashAlert, formatDate: (d: string | null) => string): string {
    if (a.kind === 'expired') return `${a.lot} expired on ${formatDate(a.expiresOn ?? null)}${a.amountG !== null ? `, ${grams(a.amountG)} left` : ''}. It is not counted as stock.`;
    if (a.kind === 'expiring') return `${a.lot} expires ${a.daysLeft === 0 ? 'today' : `in ${a.daysLeft} ${a.daysLeft === 1 ? 'day' : 'days'}`} (${formatDate(a.expiresOn ?? null)})${a.amountG !== null ? `, ${grams(a.amountG)} left` : ''}.`;
    if (a.kind === 'low') return `Only ${grams(a.amountG ?? 0)} in stock.`;
    return `Only ${grams(a.amountG ?? 0)} would be left after making these.`;
}

function usageText(u: Usage): string {
    if (u.state === 'covered') return 'in stock';
    if (u.state === 'partial') return `have ${grams(u.coveredG)} of ${grams(u.neededG)}`;
    return 'missing';
}
const USAGE_STYLE: Record<Usage['state'], string> = { covered: 'text-green-700', partial: 'text-amber-700', missing: 'text-red-700' };

export default function ShoppingListPage() {
    const { user } = useAuth();
    const { formatDate, warningDays, lowStockGrams = 20 } = useSettings();
    const { state, reload } = useShoppingData(user?.id);
    /** In the order they were chosen: stock goes to the first ones first. */
    const [chosen, setChosen] = useState<string[]>([]);
    const [batches, setBatches] = useState<Record<string, string>>({});
    const [onlyBuy, setOnlyBuy] = useState(false);
    const [ticked, setTicked] = useState<Set<string>>(new Set());

    const formulas = state.status === 'ready' ? state.data.formulas : [];

    const batchOf = (id: string) => {
        const typed = Number(batches[id]);
        if (batches[id] !== undefined && typed > 0) return typed;
        return formulas.find(f => f.id === id)?.targetWeightG || 100;
    };

    const list = useMemo(() => {
        if (state.status !== 'ready') return null;
        const picked = chosen.flatMap(id => state.data.formulas.find(f => f.id === id) ?? []);
        return buildShoppingList(
            picked.map(f => ({ id: f.id, name: f.name, batchG: batchOf(f.id), lines: f.lines.map(l => ({ ingredient: l.ingredient, percentage: l.percentage })) })),
            state.data.lots,
            state.data.stashIngredients,
            { warningDays, lowStockG: lowStockGrams },
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, chosen, batches, warningDays, lowStockGrams]);

    const toggle = (id: string) => setChosen(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id]));
    const toggleTick = (id: string) => setTicked(t => { const next = new Set(t); if (next.has(id)) next.delete(id); else next.add(id); return next; });

    const items: ShoppingItem[] = list ? list.items.filter(i => !onlyBuy || i.buyG > 0) : [];
    const picked = chosen.flatMap(id => formulas.find(f => f.id === id) ?? []);
    const nothingToPrint = !list || (list.items.length === 0 && list.alerts.length === 0);

    return (
        <StudioLayout active="shopping" title="Shopping List">
            <main className="flex-1 p-4 sm:p-8 max-w-4xl w-full mx-auto">
                {state.status === 'loading' && <p className="text-gray-500">Loading your formulas and stash…</p>}

                {state.status === 'error' && (
                    <div role="alert" className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-5">
                        <p>{state.message}</p>
                        <button type="button" onClick={reload} className="mt-3 px-4 py-2 rounded-full bg-[#2c4c3b] text-white text-sm font-bold">Try again</button>
                    </div>
                )}

                {state.status === 'ready' && list && (
                    <>
                        {/* Only on paper */}
                        <div className="hidden print:block mb-4">
                            <h1 className="text-2xl font-bold">Shopping list</h1>
                            <p className="text-sm">
                                {formatDate(new Date().toISOString())}
                                {picked.length > 0 && ` · ${picked.map(f => `${f.name} (${grams(batchOf(f.id))})`).join(', ')}`}
                            </p>
                        </div>

                        <section aria-label="Choose formulas" className="print:hidden">
                            <p className="text-gray-600 mb-4">Choose the formulas you want to make. One list shows how much of each ingredient they need together, what you already have, and what to buy.</p>
                            {formulas.length === 0 ? (
                                <div className="text-center py-12 bg-white border border-dashed border-[#c1d1b9] rounded-2xl">
                                    <p className="font-bold text-[#1f382a]">You have no formulas yet</p>
                                    <Link to="/studio/start" className="inline-block mt-4 px-5 py-2.5 bg-[#2c4c3b] text-white text-sm font-bold rounded-full hover:bg-[#1f382a]">Start a formula</Link>
                                </div>
                            ) : (
                                <ul className="grid sm:grid-cols-2 gap-3">
                                    {formulas.map(f => {
                                        const on = chosen.includes(f.id);
                                        return (
                                            <li key={f.id} className={`flex items-center gap-3 rounded-xl border p-3 ${on ? 'border-[#2c4c3b] bg-[#e9eee7]' : 'border-[#c1d1b9] bg-white'}`}>
                                                <input id={`pick-${f.id}`} type="checkbox" checked={on} onChange={() => toggle(f.id)} className="w-4 h-4 accent-[#2c4c3b]" />
                                                <label htmlFor={`pick-${f.id}`} className="flex-1 min-w-0 font-medium text-[#1f382a] truncate">{f.name}</label>
                                                {on && (
                                                    <label className="text-xs text-gray-600 flex items-center gap-1">
                                                        <span className="sr-only">{`Batch size for ${f.name} in grams`}</span>
                                                        <input
                                                            type="number" min={1}
                                                            aria-label={`Batch size for ${f.name} in grams`}
                                                            value={batches[f.id] ?? String(batchOf(f.id))}
                                                            onChange={e => setBatches(b => ({ ...b, [f.id]: e.target.value }))}
                                                            className="w-20 px-2 py-1 border border-[#c1d1b9] rounded-lg bg-white text-sm"
                                                        />
                                                        g
                                                    </label>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </section>

                        {list.alerts.length > 0 && (
                            <section aria-label="Stash alerts" className="mt-8">
                                <h2 className="text-lg font-bold text-[#1f382a] mb-3 flex items-center gap-2"><AlertTriangle size={18} aria-hidden /> Stash alerts</h2>
                                <ul className="space-y-2">
                                    {list.alerts.map((a, n) => (
                                        <li key={`${a.kind}-${a.ingredientId}-${a.lot ?? n}`} className={`p-3 rounded-lg border text-sm ${ALERT_STYLE[a.kind]}`}>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-semibold">{a.name}</span>
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-white/60">{ALERT_BADGE[a.kind]}</span>
                                            </div>
                                            <p className="mt-0.5">{alertText(a, formatDate)}{a.inList && a.kind !== 'low-after' && ' You need it for the list below.'}</p>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {picked.length > 0 && (
                            <section aria-label="Shopping list" className="mt-8">
                                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                                    <h2 className="text-lg font-bold text-[#1f382a]">
                                        {list.totalBuyG > 0 ? `To buy: ${items.filter(i => i.buyG > 0).length} ingredients, ${grams(list.totalBuyG)}` : 'You have everything'}
                                    </h2>
                                    <label className="print:hidden text-sm text-gray-700 flex items-center gap-2">
                                        <input type="checkbox" checked={onlyBuy} onChange={e => setOnlyBuy(e.target.checked)} className="accent-[#2c4c3b]" />
                                        Only what I need to buy
                                    </label>
                                </div>

                                <div className="overflow-x-auto bg-white border border-[#c1d1b9] rounded-xl print:border-black">
                                    <table className="w-full text-sm">
                                        <thead className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-[#c1d1b9]">
                                            <tr>
                                                <th className="px-3 py-2 print:hidden"><span className="sr-only">Got it</span></th>
                                                <th className="px-3 py-2">Ingredient</th>
                                                <th className="px-3 py-2">Need</th>
                                                <th className="px-3 py-2">Have</th>
                                                <th className="px-3 py-2">Buy</th>
                                                <th className="px-3 py-2">For</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.map(i => {
                                                const id = i.ingredient.id;
                                                return (
                                                    <tr key={id} data-buy={i.buyG > 0} className={`border-b border-gray-100 last:border-0 align-top ${ticked.has(id) ? 'opacity-50' : ''}`}>
                                                        <td className="px-3 py-2 print:hidden">
                                                            <input type="checkbox" aria-label={`Got ${displayName(i.ingredient)}`} checked={ticked.has(id)} onChange={() => toggleTick(id)} className="accent-[#2c4c3b]" />
                                                        </td>
                                                        <td className="px-3 py-2 font-medium">
                                                            {displayName(i.ingredient)}
                                                            {i.ingredient.trade_name && i.ingredient.inci_name !== i.ingredient.trade_name && <span className="block text-xs font-normal text-gray-500">{i.ingredient.inci_name}</span>}
                                                        </td>
                                                        <td className="px-3 py-2 tabular-nums">{grams(i.needG)}</td>
                                                        <td className="px-3 py-2 tabular-nums">{i.haveG === null ? 'some (amount not recorded)' : grams(i.haveG)}</td>
                                                        <td className={`px-3 py-2 tabular-nums font-bold ${i.buyG > 0 ? 'text-red-700' : 'text-green-700'}`}>{i.buyG > 0 ? grams(i.buyG) : '—'}</td>
                                                        <td className="px-3 py-2">
                                                            <ul>
                                                                {i.usages.map(u => (
                                                                    <li key={u.formulaId}>
                                                                        {u.formulaName} <span className="tabular-nums">{grams(u.neededG)}</span>{' '}
                                                                        <span className={USAGE_STYLE[u.state]}>· {usageText(u)}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="mt-2 text-xs text-gray-500">
                                    Water is not listed. Expired and used-up lots are not counted as stock. Where several formulas need the same ingredient, your stock goes to the first ones you chose.
                                </p>
                            </section>
                        )}

                        {picked.length === 0 && formulas.length > 0 && list.alerts.length === 0 && (
                            <p className="mt-8 text-gray-500 flex items-center gap-2 print:hidden"><Clock size={16} aria-hidden /> Nothing chosen yet.</p>
                        )}

                        <div className="mt-8 print:hidden">
                            <button
                                type="button"
                                onClick={() => window.print()}
                                disabled={nothingToPrint}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#2c4c3b] text-white text-sm font-bold hover:bg-[#1f382a] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Printer size={16} aria-hidden /> Print this list
                            </button>
                        </div>
                    </>
                )}
            </main>
        </StudioLayout>
    );
}
