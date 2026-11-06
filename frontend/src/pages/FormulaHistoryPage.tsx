import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import StudioLayout from '../components/StudioLayout';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFormulaHistory } from '../hooks/useFormulaHistory';
import { useDialog } from '../hooks/useDialog';
import { deleteVersion, diffVersions, versionLabel, type FormulaVersion, type LineChange, type LineDiff } from '../lib/formulaVersions';
import { restoreVersion } from '../lib/restoreVersion';

const CURRENT = 'current';
const ROW: Record<LineChange, string> = {
    added: 'bg-green-50',
    removed: 'bg-red-50 text-gray-500',
    changed: 'bg-amber-50',
    same: '',
};
const TAG: Record<LineChange, string> = { added: 'Added', removed: 'Removed', changed: 'Changed', same: '' };

const pct = (v: number | undefined) => (v === undefined ? '—' : `${Number(v.toFixed(3))}%`);
const signed = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Number(Math.abs(d).toFixed(3))}`;

function changeText(l: LineDiff): string {
    if (l.change === 'added') return 'Added';
    if (l.change === 'removed') return 'Removed';
    if (l.change === 'same') return '';
    const parts: string[] = [];
    if (Math.abs(l.delta) > 1e-9) parts.push(`${signed(l.delta)} pts`);
    if (l.before && l.after && l.before.phase !== l.after.phase) parts.push(`phase ${l.before.phase} → ${l.after.phase}`);
    if (l.before && l.after && l.before.is_qs !== l.after.is_qs) parts.push(l.after.is_qs ? 'now q.s.' : 'no longer q.s.');
    return parts.join(', ') || TAG.changed;
}

export default function FormulaHistoryPage() {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();
    const { formatDate } = useSettings();
    const { alert, confirm } = useDialog();
    const navigate = useNavigate();
    const { state, reload } = useFormulaHistory(id);
    const [fromKey, setFromKey] = useState<string | null>(null);
    const [toKey, setToKey] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [showSame, setShowSame] = useState(false);

    const title = state.status === 'ready' ? `History: ${state.current.name}` : 'Version history';

    const pick = (versions: FormulaVersion[], current: FormulaVersion, key: string): FormulaVersion =>
        key === CURRENT ? current : versions.find(v => v.id === key) ?? current;

    const handleRestore = async (version: FormulaVersion) => {
        if (!user || !id) return;
        const ok = await confirm(
            `Put ${versionLabel(version).toLowerCase()} back as the formula? What is there now is kept as a new version first, so nothing is lost.`,
            { title: `Go back to ${versionLabel(version).toLowerCase()}?`, confirmLabel: 'Go back', tone: 'default' },
        );
        if (!ok) return;
        setBusy(true);
        try {
            await restoreVersion(id, version);
            navigate(`/studio/${id}`);
        } catch (e) {
            void alert(e instanceof Error ? e.message : 'Something went wrong.', { tone: 'error', title: "Couldn't go back" });
            setBusy(false);
        }
    };

    const handleDelete = async (version: FormulaVersion) => {
        if (!version.id || !id) return;
        if (!(await confirm(`Delete ${versionLabel(version).toLowerCase()}? This cannot be undone.`, { title: 'Delete this version?', confirmLabel: 'Delete version', tone: 'danger' }))) return;
        setBusy(true);
        try {
            await deleteVersion(id, version.id);
            // Selections that pointed at it fall back to the defaults
            if (fromKey === version.id) setFromKey(null);
            if (toKey === version.id) setToKey(null);
            reload();
        } catch (e) {
            void alert(e instanceof Error ? e.message : 'Something went wrong.', { tone: 'error', title: "Couldn't delete the version" });
        }
        setBusy(false);
    };

    return (
        <StudioLayout active="formulations" title={title}>
            <main className="flex-1 p-4 sm:p-8 max-w-5xl w-full mx-auto">
                <Link to={`/studio/${id}`} className="text-sm font-bold text-[#2c4c3b] hover:underline">← Back to the formula</Link>

                {state.status === 'loading' && <p className="mt-6 text-gray-500">Loading the history…</p>}

                {state.status === 'error' && (
                    <div role="alert" className="mt-6 bg-red-50 border border-red-200 text-red-800 rounded-2xl p-5">
                        <p>{state.message}</p>
                        <button type="button" onClick={reload} className="mt-3 px-4 py-2 rounded-full bg-[#2c4c3b] text-white text-sm font-bold">Try again</button>
                    </div>
                )}

                {state.status === 'ready' && state.versions.length === 0 && (
                    <div className="mt-6 text-center py-16 bg-white border border-dashed border-[#c1d1b9] rounded-2xl">
                        <p className="font-bold text-[#1f382a]">No versions saved yet</p>
                        <p className="text-gray-500 mt-1 max-w-md mx-auto">
                            In the editor, choose More → Save a version… to keep a copy of the formula with a note on what you changed and why. Then you can compare it with later changes.
                        </p>
                        <Link to={`/studio/${id}`} className="inline-block mt-4 px-5 py-2.5 bg-[#2c4c3b] text-white text-sm font-bold rounded-full hover:bg-[#1f382a]">Open the formula</Link>
                    </div>
                )}

                {state.status === 'ready' && state.versions.length > 0 && (() => {
                    const { current, versions } = state;
                    const fromChoice = fromKey ?? versions[0].id!;
                    const toChoice = toKey ?? CURRENT;
                    const from = pick(versions, current, fromChoice);
                    const to = pick(versions, current, toChoice);
                    const same = fromChoice === toChoice;
                    const diff = same ? null : diffVersions(from, to);
                    const rows = diff ? diff.lines.filter(l => showSame || l.change !== 'same') : [];

                    const select = (label: string, value: string, set: (v: string) => void) => (
                        <label className="text-sm font-bold text-gray-700">
                            {label}
                            <select value={value} onChange={e => set(e.target.value)} className="block mt-1 w-full sm:w-64 px-3 py-2 border border-[#c1d1b9] rounded-lg bg-white font-normal">
                                {versions.map(v => <option key={v.id} value={v.id!}>{versionLabel(v)} · {formatDate(v.created_at)}</option>)}
                                <option value={CURRENT}>Current (as saved now)</option>
                            </select>
                        </label>
                    );

                    return (
                        <>
                            <section aria-label="Compare" className="mt-6">
                                <h2 className="text-lg font-bold text-[#1f382a] mb-3">Compare</h2>
                                <div className="flex flex-wrap gap-4 mb-4">
                                    {select('From', fromChoice, setFromKey)}
                                    {select('To', toChoice, setToKey)}
                                </div>

                                {same && <p className="text-gray-500">Pick two different versions to compare.</p>}

                                {diff && (
                                    <div>
                                        <div className="grid sm:grid-cols-2 gap-3 mb-4">
                                            {[from, to].map((v, n) => (
                                                <div key={n} className="bg-white border border-[#c1d1b9] rounded-xl p-3 text-sm">
                                                    <p className="font-bold text-[#1f382a]">{versionLabel(v)}{v.created_at && <span className="font-normal text-gray-500"> · {formatDate(v.created_at)}</span>}</p>
                                                    <p className="text-gray-700 mt-1">{v.note ?? <span className="text-gray-400 italic">{v.version_number === null ? 'The formula as it is saved now.' : 'No note.'}</span>}</p>
                                                </div>
                                            ))}
                                        </div>

                                        {diff.identical ? (
                                            <p role="status" className="text-gray-600 bg-white border border-[#c1d1b9] rounded-xl p-4">These two are identical.</p>
                                        ) : (
                                            <>
                                                <p role="status" className="text-sm text-gray-700 mb-3">
                                                    {[
                                                        diff.counts.changed && `${diff.counts.changed} changed`,
                                                        diff.counts.added && `${diff.counts.added} added`,
                                                        diff.counts.removed && `${diff.counts.removed} removed`,
                                                        `${diff.counts.same} unchanged`,
                                                    ].filter(Boolean).join(' · ')}
                                                </p>
                                                {diff.meta.length > 0 && (
                                                    <ul aria-label="Other differences" className="mb-3 text-sm text-gray-700 space-y-1">
                                                        {diff.meta.map(m => <li key={m.field}><span className="font-bold capitalize">{m.field}:</span> {m.before} → {m.after}</li>)}
                                                    </ul>
                                                )}
                                                <div className="overflow-x-auto bg-white border border-[#c1d1b9] rounded-xl">
                                                    <table className="w-full text-sm">
                                                        <thead className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-[#c1d1b9]">
                                                            <tr>
                                                                <th className="px-3 py-2">Ingredient</th>
                                                                <th className="px-3 py-2">{versionLabel(from)}</th>
                                                                <th className="px-3 py-2">{versionLabel(to)}</th>
                                                                <th className="px-3 py-2">Change</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {rows.map(l => (
                                                                <tr key={l.key} data-change={l.change} className={`border-b border-gray-100 last:border-0 ${ROW[l.change]}`}>
                                                                    <td className="px-3 py-2 font-medium">{l.name}</td>
                                                                    <td className="px-3 py-2 tabular-nums">{l.before ? `${pct(l.before.percentage)} · ${l.before.phase}` : '—'}</td>
                                                                    <td className="px-3 py-2 tabular-nums">{l.after ? `${pct(l.after.percentage)} · ${l.after.phase}` : '—'}</td>
                                                                    <td className="px-3 py-2 font-bold">{changeText(l)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </>
                                        )}
                                        {diff.counts.same > 0 && (
                                            <button type="button" onClick={() => setShowSame(s => !s)} className="mt-3 text-sm font-bold text-[#2c4c3b] hover:underline">
                                                {showSame ? 'Hide unchanged ingredients' : `Show ${diff.counts.same} unchanged ingredients`}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </section>

                            <section aria-label="Saved versions" className="mt-10">
                                <h2 className="text-lg font-bold text-[#1f382a] mb-3">Saved versions</h2>
                                <ul className="space-y-3">
                                    {versions.map(v => (
                                        <li key={v.id} className="bg-white border border-[#c1d1b9] rounded-2xl p-4">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="font-bold text-[#1f382a]">{versionLabel(v)} <span className="font-normal text-gray-500">· {formatDate(v.created_at)} · {v.lines.length} ingredients</span></p>
                                                    <p className="text-sm text-gray-700 mt-1 break-words">{v.note ?? <span className="text-gray-400 italic">No note.</span>}</p>
                                                </div>
                                                <div className="flex gap-2 shrink-0">
                                                    <button type="button" disabled={busy} onClick={() => { setFromKey(v.id); setToKey(CURRENT); }} className="px-3 py-1.5 rounded-full border border-[#c1d1b9] text-sm font-bold text-[#2c4c3b] hover:bg-[#e9eee7] disabled:opacity-50">Compare with current</button>
                                                    <button type="button" disabled={busy} onClick={() => void handleRestore(v)} className="px-3 py-1.5 rounded-full bg-[#2c4c3b] text-white text-sm font-bold hover:bg-[#1f382a] disabled:opacity-50">Go back to this</button>
                                                    <button type="button" disabled={busy} onClick={() => void handleDelete(v)} aria-label={`Delete ${versionLabel(v)}`} className="px-3 py-1.5 rounded-full text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">Delete</button>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        </>
                    );
                })()}
            </main>
        </StudioLayout>
    );
}
