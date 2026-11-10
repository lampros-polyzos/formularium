import { useEffect, useState } from 'react';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { ACTIONS, MIN_SEARCH, adminStatus, eventLabel, openMember, performAction, searchMembers, type AdminAction, type AdminDetail, type AdminMember, type AdminStatus } from '../lib/adminClient';

const field = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none';
const primary = 'px-4 py-2 text-sm font-medium rounded-lg bg-[#2c4c3b] text-white hover:bg-[#1f382a] transition-colors disabled:opacity-50';

const messageOf = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong. Please try again.');

/**
 * The admin tool: look a member up, give or take away moderator rights, and the recovery steps that used to need hand-written SQL. Only administrators see the link;
 * the backend decides again on every call. Each change asks for the administrator's own password and a reason, is written to the audit log, and is emailed to the member.
 */
export default function AdminPage() {
    const { user } = useAuth();
    const { formatDate } = useSettings();
    const [status, setStatus] = useState<AdminStatus | null>(null);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<AdminMember[] | null>(null);
    const [detail, setDetail] = useState<AdminDetail | null>(null);
    const [choice, setChoice] = useState<AdminAction | null>(null);
    const [reason, setReason] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState('');

    useEffect(() => {
        if (!user?.admin) return;
        let live = true;
        adminStatus().then(s => { if (live) setStatus(s); }).catch(() => { if (live) setStatus({ admin: false, secondFactor: false }); });
        return () => { live = false; };
    }, [user?.admin]);

    const search = async () => {
        setBusy(true);
        setError('');
        setDone('');
        setDetail(null);
        try { setResults(await searchMembers(query)); } catch (err) { setError(messageOf(err)); setResults(null); } finally { setBusy(false); }
    };

    const open = async (id: string) => {
        setBusy(true);
        setError('');
        setDone('');
        setChoice(null);
        try { setDetail(await openMember(id)); } catch (err) { setError(messageOf(err)); } finally { setBusy(false); }
    };

    const confirm = async () => {
        if (!detail || !choice) return;
        setBusy(true);
        setError('');
        try {
            const updated = await performAction(detail.member.id, { action: choice, reason, password });
            setDetail(updated);
            setResults(prev => prev && prev.map(m => (m.id === updated.member.id ? updated.member : m)));
            setDone(`Done: ${ACTIONS.find(a => a.id === choice)?.label ?? choice}. The member was told by email.`);
            setChoice(null);
            setReason('');
            setPassword('');
        } catch (err) {
            setError(messageOf(err));
            setPassword('');
        } finally {
            setBusy(false);
        }
    };

    const body = () => {
        if (!user?.admin || (status && !status.admin)) return <p className="text-gray-600">This page is for administrators.</p>;
        if (!status) return <p className="text-gray-500">Loading...</p>;
        if (!status.secondFactor) {
            return (
                <p role="alert" className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
                    Your own account needs two-step verification or a passkey before you can use this tool: this account can open other people&apos;s. Switch one on in Global Settings, then come back.
                </p>
            );
        }
        const member = detail?.member;
        const selected = ACTIONS.find(a => a.id === choice);
        return (
            <>
                <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void search(); }}>
                    <input className={field} aria-label="Email address or username" placeholder="Email address or username" value={query} onChange={e => setQuery(e.target.value)} />
                    <button type="submit" className={primary} disabled={busy || query.trim().length < MIN_SEARCH}>Search</button>
                </form>
                {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
                {done && <p role="status" className="text-green-800 text-sm">{done}</p>}
                {results && results.length === 0 && <p className="text-gray-600 text-sm">No member matches.</p>}
                {results && results.length > 0 && (
                    <ul className="bg-white rounded-xl border border-[#c1d1b9] divide-y divide-gray-100">
                        {results.map(m => (
                            <li key={m.id}>
                                <button type="button" onClick={() => void open(m.id)} className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm">
                                    <span className="font-semibold text-[#1f382a]">{m.username}</span> <span className="text-gray-500">{m.email}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {detail && member && (
                    <article className="bg-white rounded-xl border border-[#c1d1b9] p-5 space-y-4" aria-label={`Member ${member.username}`}>
                        <div>
                            <h2 className="text-lg font-bold text-[#1f382a]">{member.username}</h2>
                            <p className="text-sm text-gray-500">{member.email}</p>
                        </div>
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                            <dt className="text-gray-500">Email confirmed</dt><dd>{member.emailVerified ? 'Yes' : 'No'}</dd>
                            <dt className="text-gray-500">Moderator</dt><dd>{member.moderator ? 'Yes' : 'No'}</dd>
                            <dt className="text-gray-500">Two-step verification</dt><dd>{member.twoStepOn ? 'On' : 'Off'}</dd>
                            <dt className="text-gray-500">Passkeys</dt><dd>{member.passkeys}</dd>
                            <dt className="text-gray-500">Password sign-in</dt><dd>{!member.hasPassword ? 'No password' : member.passwordSignInOff ? 'Switched off' : 'On'}</dd>
                            <dt className="text-gray-500">Google linked</dt><dd>{member.googleLinked ? 'Yes' : 'No'}</dd>
                            <dt className="text-gray-500">Joined</dt><dd>{formatDate(member.createdAt)}</dd>
                            <dt className="text-gray-500">Last sign-in</dt><dd>{member.lastLoginAt ? formatDate(member.lastLoginAt) : 'Never'}</dd>
                        </dl>

                        <div className="space-y-2">
                            <h3 className="font-semibold text-[#1f382a] text-sm">Actions</h3>
                            <p className="text-xs text-gray-500">Make sure the person asking is the member before you change anything: reply to the email address on the account, not to the one that wrote to you.</p>
                            <div className="flex flex-wrap gap-2">
                                {ACTIONS.filter(a => a.needs(member)).map(a => (
                                    <button key={a.id} type="button" onClick={() => { setChoice(a.id); setError(''); setDone(''); }}
                                        className={`px-3 py-1.5 text-sm rounded-lg border ${a.danger ? 'border-red-300 text-red-700 hover:bg-red-50' : 'border-[#c1d1b9] text-[#2c4c3b] hover:bg-gray-50'}`}>
                                        {a.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {selected && (
                            <form className="space-y-3 border border-gray-200 rounded-lg p-4" onSubmit={e => { e.preventDefault(); void confirm(); }} aria-label={selected.label}>
                                <p className="text-sm font-medium text-[#1f382a]">{selected.label}</p>
                                <p className="text-xs text-gray-500">{selected.help} The member is told by email, and this is recorded.</p>
                                <label className="block text-sm">Reason (kept in the audit log)
                                    <input className={field} value={reason} maxLength={300} onChange={e => setReason(e.target.value)} />
                                </label>
                                <label className="block text-sm">Your password
                                    <input className={field} type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
                                </label>
                                <div className="flex gap-2">
                                    <button type="submit" className={primary} disabled={busy || reason.trim().length < 3 || password.length === 0}>Confirm</button>
                                    <button type="button" className="px-4 py-2 text-sm text-gray-600" onClick={() => { setChoice(null); setPassword(''); }}>Cancel</button>
                                </div>
                            </form>
                        )}

                        <div className="grid md:grid-cols-2 gap-4 text-sm">
                            <section>
                                <h3 className="font-semibold text-[#1f382a] mb-1">Recent account events</h3>
                                {detail.events.length === 0 ? <p className="text-gray-500">None.</p> : (
                                    <ul className="space-y-0.5">{detail.events.map((e, i) => <li key={i}>{eventLabel(e.type)} <span className="text-gray-400">{formatDate(e.at)}</span></li>)}</ul>
                                )}
                            </section>
                            <section>
                                <h3 className="font-semibold text-[#1f382a] mb-1">Browsers seen</h3>
                                {detail.devices.length === 0 ? <p className="text-gray-500">None.</p> : (
                                    <ul className="space-y-0.5">{detail.devices.map((d, i) => <li key={i}>{d.description} <span className="text-gray-400">last {formatDate(d.lastSeenAt)}</span></li>)}</ul>
                                )}
                            </section>
                        </div>

                        <section className="text-sm">
                            <h3 className="font-semibold text-[#1f382a] mb-1">Changes by administrators</h3>
                            {detail.history.length === 0 ? <p className="text-gray-500">None.</p> : (
                                <ul className="space-y-0.5">
                                    {detail.history.map((h, i) => (
                                        <li key={i}>{ACTIONS.find(a => a.id === h.action)?.label ?? h.action}: {h.reason} <span className="text-gray-400">{h.adminEmail}, {formatDate(h.at)}</span></li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </article>
                )}
            </>
        );
    };

    return (
        <div className="min-h-screen bg-[#f7f8f6]">
            <Header title="Admin" backPath="/" backLabel="Back" />
            <main className="max-w-3xl mx-auto p-6 md:p-10 space-y-4">
                <h1 className="text-2xl font-bold text-[#1f382a]">Members</h1>
                {body()}
            </main>
        </div>
    );
}
