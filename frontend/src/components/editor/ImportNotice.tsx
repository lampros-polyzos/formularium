export interface ImportNoticeData {
    warnings: string[];
    skipped: string[];
}

/** Shown after a formula is created from pasted text: what happened, what was left out, and what to check. */
export default function ImportNotice({ warnings, skipped, onDismiss }: ImportNoticeData & { onDismiss: () => void }) {
    return (
        <section aria-label="Imported formula" className="bg-[#e9eee7] border border-[#c1d1b9] rounded-lg px-4 py-3 text-sm text-[#1f382a]">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="font-bold">Imported from pasted text</h2>
                    <p className="text-xs text-[#3a5a4a] mt-0.5">
                        Ingredients were matched to your library. Check each name and amount, and let the alerts guide you: it has not been tested.
                    </p>
                </div>
                <button onClick={onDismiss} className="shrink-0 text-xs font-bold text-[#2c4c3b] hover:underline">Got it</button>
            </div>
            {skipped.length > 0 && (
                <p role="status" className="mt-2 text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded px-3 py-2">
                    Left out because they were not matched: <strong>{skipped.join(', ')}</strong>. Search for one above to add it.
                </p>
            )}
            {warnings.length > 0 && (
                <ul className="mt-2 text-xs text-amber-900 list-disc pl-5">
                    {warnings.map(warning => <li key={warning}>{warning}</li>)}
                </ul>
            )}
        </section>
    );
}
