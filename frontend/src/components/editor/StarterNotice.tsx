import type { StarterTemplate } from '../../lib/starterTemplates';

export interface StarterNoticeData {
    template: StarterTemplate;
    /** Required ingredients that are not in the library. */
    missing: string[];
    /** Things the balancer wants the user to know about the result. */
    warnings: string[];
}

interface StarterNoticeProps extends StarterNoticeData {
    onDismiss: () => void;
}

/** Shown after a formula is started from a template: what happened, what could not be filled in, and what to do next. */
export default function StarterNotice({ template, missing, warnings, onDismiss }: StarterNoticeProps) {
    return (
        <section aria-label="Starter template" className="bg-[#e9eee7] border border-[#c1d1b9] rounded-lg px-4 py-3 text-sm text-[#1f382a]">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="font-bold">Started from the {template.name} template</h2>
                    <p className="text-xs text-[#3a5a4a] mt-0.5">
                        Balanced to 100% using your ingredient library. It is a starting point: change anything, and the alerts will guide you.
                    </p>
                </div>
                <button onClick={onDismiss} className="shrink-0 text-xs font-bold text-[#2c4c3b] hover:underline">Got it</button>
            </div>

            {missing.length > 0 && (
                <p role="status" className="mt-2 text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded px-3 py-2">
                    Not in your library, so left out: <strong>{missing.join(', ')}</strong>. Search for one above to add it.
                </p>
            )}
            {warnings.length > 0 && (
                <ul className="mt-2 text-xs text-amber-900 list-disc pl-5">
                    {warnings.map(warning => <li key={warning}>{warning}</li>)}
                </ul>
            )}

            <p className="mt-2 text-xs font-bold text-[#3a5a4a]">Next</p>
            <ul className="text-xs text-gray-700 list-disc pl-5">
                {template.nextSteps.map(step => <li key={step}>{step}</li>)}
            </ul>
        </section>
    );
}
