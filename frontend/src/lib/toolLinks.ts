export const TOOLS = [
    { id: 'hlb', label: 'HLB blend', blurb: 'Pick the right emulsifier mix for your oils.' },
    { id: 'ph', label: 'pH adjuster', blurb: 'Scale a small test up to how much acid or base your batch needs.' },
    { id: 'dilution', label: 'Dilution', blurb: 'Make a weaker solution from a stronger one.' },
    { id: 'preservative', label: 'Preservative', blurb: 'Grams of preservative for your batch size.' },
    { id: 'units', label: 'Units', blurb: 'Grams, ounces, millilitres, densities and temperatures.' },
] as const;

export type ToolId = (typeof TOOLS)[number]['id'];

export const isToolId = (value: string | null): value is ToolId => TOOLS.some(t => t.id === value);

/** Link to a calculator, optionally filled in with what the caller already knows (batch size, water %, target pH). */
export function toolsUrl(tool: ToolId, values: Partial<Record<'batch' | 'water' | 'target' | 'hlb', number | string | undefined | null>> = {}): string {
    const params = new URLSearchParams({ tool });
    for (const [key, value] of Object.entries(values)) {
        if (value === undefined || value === null || value === '' || (typeof value === 'number' && !Number.isFinite(value))) continue;
        params.set(key, String(value));
    }
    return `/tools?${params.toString()}`;
}

export interface FixToolContext {
    batchG?: number;
    waterPct?: number;
    targetPh?: number | null;
}

/** The calculator that helps with a fix, filled in from the formula, or null when none applies. */
export function fixToolLink(category: string, ctx: FixToolContext): { label: string; href: string } | null {
    const batch = ctx.batchG && ctx.batchG > 0 ? ctx.batchG : undefined;
    switch (category) {
        case 'preservative': {
            const water = ctx.waterPct && ctx.waterPct > 0 ? Math.round(ctx.waterPct * 10) / 10 : undefined;
            return { label: 'Work out the dose', href: toolsUrl('preservative', { batch, water }) };
        }
        case 'emulsifier':
            return { label: 'Find the right HLB mix', href: toolsUrl('hlb') };
        case 'neutralizer':
            return { label: 'Work out how much to add', href: toolsUrl('ph', { batch, target: ctx.targetPh }) };
        default:
            return null;
    }
}
