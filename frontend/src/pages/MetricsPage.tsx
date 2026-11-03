import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Lightbulb, XCircle } from 'lucide-react';
import StudioLayout from '../components/StudioLayout';
import { BarList, ColumnChart, Panel, Tile, type BarRow } from '../components/metrics/charts';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useMetricsData } from '../hooks/useMetricsData';
import { formatMoney } from '../lib/batchCost';
import { computeMetrics, RANGES, type RangeId } from '../lib/metrics';
import { buildInsights, WEEKDAYS } from '../lib/metricsInsights';
import { OBSERVATION_LABELS } from '../types/batches';

type Measure = 'batches' | 'grams' | 'spend';
type IngredientView = 'use' | 'grams' | 'spend';

const grams = (g: number) => (g >= 1000 ? `${Number((g / 1000).toFixed(2))} kg` : `${Number(g.toFixed(1))} g`);
const count = (n: number) => Number(n.toFixed(1)).toString();
const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-sm font-bold border transition-colors ${on ? 'bg-[#2c4c3b] text-white border-[#2c4c3b]' : 'bg-white text-[#2c4c3b] border-[#c1d1b9] hover:bg-[#e9eee7]'}`;
const monthLabel = (key: string) => new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

const TONE = {
    good: 'border-green-300 bg-green-50 text-green-900',
    note: 'border-[#c1d1b9] bg-[#f4f7f2] text-[#1f382a]',
    warn: 'border-amber-300 bg-amber-50 text-amber-900',
} as const;

export default function MetricsPage() {
    const { user } = useAuth();
    const { currency, warningDays, lowStockGrams = 20, formatDate } = useSettings();
    const { state, reload } = useMetricsData(user?.id);
    const [range, setRange] = useState<RangeId>('all');
    const [measure, setMeasure] = useState<Measure>('batches');
    const [view, setView] = useState<IngredientView>('use');

    const metrics = useMemo(
        () => (state.status === 'ready' ? computeMetrics(state.input, { range, warningDays, lowStockG: lowStockGrams }) : null),
        [state, range, warningDays, lowStockGrams],
    );
    const money = (v: number) => formatMoney(v, currency);

    return (
        <StudioLayout active="metrics" title="Metrics">
            <main className="flex-1 p-4 sm:p-8 max-w-5xl w-full mx-auto">
                {state.status === 'loading' && <p className="text-gray-500">Adding up your batches, formulas and stash…</p>}

                {state.status === 'error' && (
                    <div role="alert" className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-5">
                        <p>{state.message}</p>
                        <button type="button" onClick={reload} className="mt-3 px-4 py-2 rounded-full bg-[#2c4c3b] text-white text-sm font-bold">Try again</button>
                    </div>
                )}

                {metrics && state.status === 'ready' && (() => {
                    const { overview: o, activity, stability, yieldStats, favorites, library, stash } = metrics;
                    const insights = buildInsights(metrics, currency);
                    const everMade = state.input.batches.some(b => b.status !== 'voided');

                    const ingredientRows: BarRow[] = (view === 'use' ? metrics.ingredientsByUse : view === 'grams' ? metrics.ingredientsByGrams : metrics.ingredientsBySpend).map(i => ({
                        id: i.key,
                        label: i.name,
                        value: view === 'use' ? i.batches : view === 'grams' ? i.grams : i.cost,
                        display: view === 'use' ? `${i.batches} ${i.batches === 1 ? 'batch' : 'batches'}` : view === 'grams' ? grams(i.grams) : money(i.cost),
                        sub: view === 'use' ? `${grams(i.grams)} in total` : view === 'grams' ? `in ${i.batches} ${i.batches === 1 ? 'batch' : 'batches'}` : `${grams(i.grams)} in ${i.batches} ${i.batches === 1 ? 'batch' : 'batches'}`,
                    }));

                    const columns = activity.months.map(m => ({
                        id: m.month,
                        label: monthLabel(m.month),
                        value: measure === 'batches' ? m.batches : measure === 'grams' ? m.grams : m.spend,
                        display: measure === 'batches' ? String(m.batches) : measure === 'grams' ? grams(m.grams) : money(m.spend),
                    }));

                    return (
                        <>
                            <div role="group" aria-label="Time range" className="flex flex-wrap gap-2 mb-6">
                                {RANGES.map(r => <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)} className={chip(range === r.id)}>{r.label}</button>)}
                            </div>

                            {insights.length > 0 && (
                                <section aria-label="Highlights" className="mb-6">
                                    <h2 className="text-base font-bold text-[#1f382a] mb-3 flex items-center gap-2"><Lightbulb size={16} aria-hidden /> Highlights</h2>
                                    <ul className="grid sm:grid-cols-2 gap-2">
                                        {insights.map(i => <li key={i.id} className={`p-3 rounded-xl border text-sm ${TONE[i.tone]}`}>{i.text}</li>)}
                                    </ul>
                                </section>
                            )}

                            {!everMade && (
                                <div className="text-center py-12 bg-white border border-dashed border-[#c1d1b9] rounded-2xl mb-6">
                                    <p className="font-bold text-[#1f382a]">No batches yet</p>
                                    <p className="text-gray-500 mt-1 max-w-md mx-auto">Once you log a batch from the editor (More → Make batch), your ingredients, costs and habits show up here.</p>
                                    <Link to="/studio" className="inline-block mt-4 px-5 py-2.5 bg-[#2c4c3b] text-white text-sm font-bold rounded-full hover:bg-[#1f382a]">Open the Studio</Link>
                                </div>
                            )}

                            {everMade && (
                                <>
                                    <section aria-label="Overview" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                        <Tile label="Batches made" value={String(o.batches)} hint={o.lastMadeOn ? `Last one ${formatDate(o.lastMadeOn)}` : undefined} />
                                        <Tile label="Total made" value={grams(o.gramsMade)} hint={o.batches ? `${grams(o.avgBatchG)} per batch` : undefined} />
                                        <Tile label="Spent on ingredients" value={money(o.ingredientSpend)} hint={o.pricedBatches < o.batches ? `${o.pricedBatches} of ${o.batches} batches have prices` : undefined} />
                                        <Tile label="Average per batch" value={o.avgCostPerBatch === null ? '—' : money(o.avgCostPerBatch)} hint={o.costPer100g === null ? undefined : `${money(o.costPer100g)} per 100 g`} />
                                        <Tile label="Containers filled" value={count(o.containersFilled)} hint={o.containerSpend > 0 ? `${money(o.containerSpend)} on containers` : undefined} />
                                        <Tile label="Different ingredients" value={String(o.distinctIngredients)} />
                                        <Tile label="Different formulas" value={String(o.distinctFormulas)} />
                                        <Tile label="Weeks in a row" value={String(activity.streakWeeks)} hint={o.daysSinceLast === null ? undefined : o.daysSinceLast === 0 ? 'Made one today' : `${o.daysSinceLast} days since the last batch`} />
                                    </section>
                                    {o.mostExpensive && (
                                        <p className="mt-2 text-sm text-gray-600">Dearest batch: <span className="font-bold">{o.mostExpensive.name}</span> at {money(o.mostExpensive.cost)} ({formatDate(o.mostExpensive.made_on)}).</p>
                                    )}

                                    <div className="mt-6 grid lg:grid-cols-2 gap-4">
                                        <Panel title="Ingredients you use" hint="Across the batches in this period">
                                            <div role="group" aria-label="Rank ingredients by" className="flex flex-wrap gap-2 mb-4">
                                                {([['use', 'Most used'], ['grams', 'Most grams'], ['spend', 'Most spent']] as const).map(([id, text]) => (
                                                    <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={chip(view === id)}>{text}</button>
                                                ))}
                                            </div>
                                            <BarList rows={ingredientRows} label="Ingredients" empty={view === 'spend' ? 'No prices recorded yet. Add a price to a stash lot and it shows here.' : 'No ingredients in this period.'} />
                                        </Panel>

                                        <Panel title="Formulas you make most" hint="By number of batches">
                                            <BarList
                                                label="Formulas"
                                                rows={metrics.formulasByBatches.map(f => ({
                                                    id: f.key, label: f.name, value: f.batches, display: `${f.batches} ${f.batches === 1 ? 'batch' : 'batches'}`,
                                                    sub: `${grams(f.grams)} · last made ${formatDate(f.lastMade)}${f.discarded > 0 ? ` · ${f.discarded} thrown away` : ''}`,
                                                }))}
                                                empty="No batches in this period."
                                            />
                                        </Panel>
                                    </div>

                                    <div className="mt-4">
                                        <Panel title="How often you make things" hint="Per month">
                                            <div role="group" aria-label="Measure" className="flex flex-wrap gap-2 mb-4">
                                                {([['batches', 'Batches'], ['grams', 'Grams'], ['spend', 'Spent']] as const).map(([id, text]) => (
                                                    <button key={id} type="button" aria-pressed={measure === id} onClick={() => setMeasure(id)} className={chip(measure === id)}>{text}</button>
                                                ))}
                                            </div>
                                            <ColumnChart columns={columns} label={`${measure === 'batches' ? 'Batches' : measure === 'grams' ? 'Grams made' : 'Spent on ingredients'} per month`} unit={measure === 'batches' ? 'batches' : measure === 'grams' ? 'made' : 'spent'} />
                                            <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                                                <div><dt className="text-gray-500">Busiest month</dt><dd className="font-bold text-[#1f382a]">{activity.busiestMonth ? `${monthLabel(activity.busiestMonth.month)} (${activity.busiestMonth.batches})` : '—'}</dd></div>
                                                <div><dt className="text-gray-500">On a month you make</dt><dd className="font-bold text-[#1f382a]">{activity.avgPerActiveMonth ? `${count(activity.avgPerActiveMonth)} batches` : '—'}</dd></div>
                                                <div><dt className="text-gray-500">Favourite day</dt><dd className="font-bold text-[#1f382a]">{activity.busiestWeekday === null ? '—' : WEEKDAYS[activity.busiestWeekday]}</dd></div>
                                            </dl>
                                            <div className="mt-4">
                                                <BarList label="Batches by day of the week" rows={WEEKDAYS.map((d, n) => ({ id: d, label: d, value: activity.weekdays[n], display: String(activity.weekdays[n]) }))} />
                                            </div>
                                        </Panel>
                                    </div>

                                    <div className="mt-4 grid lg:grid-cols-2 gap-4">
                                        <Panel title="Containers" hint="What your batches go into">
                                            <BarList
                                                label="Containers"
                                                rows={metrics.containers.map(c => ({
                                                    id: c.name, label: c.name, value: c.batches, display: `${c.batches} ${c.batches === 1 ? 'batch' : 'batches'}`,
                                                    sub: c.name.startsWith('No container') ? undefined : `${count(c.filled)} filled${c.volumeMl ? ` · ${c.volumeMl} ml each` : ''}${c.spend > 0 ? ` · ${money(c.spend)}` : ''}`,
                                                }))}
                                                empty="No batches in this period."
                                            />
                                        </Panel>

                                        <Panel title="How they hold up" hint="Your stability check-ins">
                                            {stability.checksDone === 0 ? (
                                                <p className="text-sm text-gray-500">No check-ins done yet. The app asks at 24 hours, 1 week and 4 weeks.</p>
                                            ) : (
                                                <>
                                                    <ul aria-label="Check-in results" className="space-y-2 text-sm">
                                                        <li className="flex items-center gap-2 text-green-800"><CheckCircle2 size={16} aria-hidden /> Looks good <span className="ml-auto font-bold tabular-nums">{stability.results.good}</span></li>
                                                        <li className="flex items-center gap-2 text-amber-800"><AlertTriangle size={16} aria-hidden /> Minor change <span className="ml-auto font-bold tabular-nums">{stability.results.minor}</span></li>
                                                        <li className="flex items-center gap-2 text-red-800"><XCircle size={16} aria-hidden /> Failed <span className="ml-auto font-bold tabular-nums">{stability.results.failed}</span></li>
                                                    </ul>
                                                    {stability.problems.length > 0 && (
                                                        <div className="mt-4">
                                                            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">What you noticed most</p>
                                                            <BarList label="Problems noticed" rows={stability.problems.slice(0, 5).map(p => ({ id: p.id, label: OBSERVATION_LABELS[p.id] ?? p.id, value: p.count, display: `${p.count}×` }))} />
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </Panel>
                                    </div>

                                    <div className="mt-4 grid lg:grid-cols-2 gap-4">
                                        <Panel title="Yield and waste">
                                            <dl className="grid grid-cols-2 gap-3 text-sm">
                                                <div><dt className="text-gray-500">Average yield</dt><dd className="font-bold text-[#1f382a]">{yieldStats.avgPercent === null ? '—' : `${yieldStats.avgPercent}%`}</dd><dd className="text-xs text-gray-500">{yieldStats.measured === 0 ? 'Record the final weight on a batch to see it' : `from ${yieldStats.measured} weighed ${yieldStats.measured === 1 ? 'batch' : 'batches'}`}</dd></div>
                                                <div><dt className="text-gray-500">Lost in making</dt><dd className="font-bold text-[#1f382a]">{yieldStats.measured ? grams(yieldStats.lostG) : '—'}</dd></div>
                                                <div><dt className="text-gray-500">Thrown away</dt><dd className="font-bold text-[#1f382a]">{o.discarded} {o.discarded === 1 ? 'batch' : 'batches'}</dd><dd className="text-xs text-gray-500">{o.discarded ? grams(o.discardedGrams) : 'None'}</dd></div>
                                                <div><dt className="text-gray-500">Wasted on ingredients</dt><dd className="font-bold text-[#1f382a]">{o.discarded ? money(o.discardedCost) : '—'}</dd></div>
                                            </dl>
                                        </Panel>

                                        <Panel title="Favourite ingredients" hint="The ones you have starred">
                                            {favorites.used.length === 0 && favorites.neverUsed.length === 0 ? (
                                                <p className="text-sm text-gray-500">You have not starred any ingredients yet. Star one in the editor or the library to keep it close.</p>
                                            ) : (
                                                <>
                                                    <BarList label="Favourites in use" rows={favorites.used.slice(0, 8).map(f => ({ id: f.key, label: f.name, value: f.batches, display: `${f.batches} ${f.batches === 1 ? 'batch' : 'batches'}`, sub: grams(f.grams) }))} empty="None of your favourites went into a batch in this period." />
                                                    {favorites.neverUsed.length > 0 && (
                                                        <p className="mt-4 text-sm text-gray-600"><span className="font-bold">Never used:</span> {favorites.neverUsed.map(f => f.name).join(', ')}</p>
                                                    )}
                                                </>
                                            )}
                                            {favorites.notStarred.length > 0 && (
                                                <p className="mt-3 text-sm text-gray-600"><span className="font-bold">Used a lot, not starred:</span> {favorites.notStarred.map(f => f.name).join(', ')}</p>
                                            )}
                                        </Panel>
                                    </div>
                                </>
                            )}

                            <div className="mt-4 grid lg:grid-cols-2 gap-4">
                                <Panel title="Your stash" hint="As it is right now">
                                    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                                        <div><dt className="text-gray-500">Value</dt><dd className="font-bold text-[#1f382a]">{money(stash.value)}</dd>{stash.unpricedLots > 0 && <dd className="text-xs text-gray-500">{stash.unpricedLots} lots have no price</dd>}</div>
                                        <div><dt className="text-gray-500">Lots</dt><dd className="font-bold text-[#1f382a]">{stash.lots}</dd><dd className="text-xs text-gray-500">{stash.ingredients} ingredients</dd></div>
                                        <div><dt className="text-gray-500">Running low</dt><dd className="font-bold text-[#1f382a]">{stash.low}</dd></div>
                                        <div><dt className="text-gray-500">Expired</dt><dd className={`font-bold ${stash.expired ? 'text-red-700' : 'text-[#1f382a]'}`}>{stash.expired}</dd></div>
                                        <div><dt className="text-gray-500">Expiring soon</dt><dd className={`font-bold ${stash.expiring ? 'text-orange-700' : 'text-[#1f382a]'}`}>{stash.expiring}</dd></div>
                                    </dl>
                                </Panel>

                                <Panel title="Sitting idle" hint="In your stash, but never used in a batch">
                                    <BarList
                                        label="Idle stash"
                                        rows={stash.idle.map(i => ({ id: i.id, label: i.name, value: i.value ?? 0, display: i.value === null ? (i.grams === null ? 'amount unknown' : grams(i.grams)) : money(i.value), sub: i.value !== null && i.grams !== null ? grams(i.grams) : undefined }))}
                                        empty="Everything in your stash has been used."
                                    />
                                </Panel>
                            </div>

                            <div className="mt-4">
                                <Panel title="Your formulas">
                                    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                                        <div><dt className="text-gray-500">Formulas</dt><dd className="font-bold text-[#1f382a]">{library.formulas}</dd></div>
                                        <div><dt className="text-gray-500">Ingredients per formula</dt><dd className="font-bold text-[#1f382a]">{library.avgIngredients === null ? '—' : count(library.avgIngredients)}</dd></div>
                                        <div><dt className="text-gray-500">Shared with the community</dt><dd className="font-bold text-[#1f382a]">{library.shared}</dd></div>
                                    </dl>
                                    {library.neverMade.length > 0 && (
                                        <p className="mt-4 text-sm text-gray-600"><span className="font-bold">Never made:</span> {library.neverMade.slice(0, 8).map(f => f.name).join(', ')}{library.neverMade.length > 8 ? ` and ${library.neverMade.length - 8} more` : ''}</p>
                                    )}
                                </Panel>
                            </div>
                        </>
                    );
                })()}
            </main>
        </StudioLayout>
    );
}
