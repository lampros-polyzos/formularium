import type { TourStep } from './GuidedTour';

// Targets match the data-tour attributes in FormulationEditor
export const EDITOR_TOUR_STEPS: TourStep[] = [
    {
        title: 'Welcome to the Formulation Studio 🧪',
        body: (
            <>
                <p>This quick tour shows you how to build a cosmetic formula from scratch, step by step.</p>
                <p className="text-xs text-gray-500">Takes about a minute. Use ← → on your keyboard, or Esc to skip.</p>
            </>
        ),
    },
    {
        target: 'settings',
        title: '1. Start with a product profile',
        body: (
            <>
                <p>Pick what you're making, e.g. a lotion, serum or body butter. The profile sets a sensible <strong>target pH</strong> and tells the companion which rules to check.</p>
                <p>For water-based products, <strong>water is added for you</strong>.</p>
                <p><strong>Target weight</strong> is your batch size; every gram amount is calculated from it.</p>
            </>
        ),
    },
    {
        target: 'search',
        title: '2. Add ingredients',
        body: (
            <p>Search by trade name, INCI name or function (try <em>"emulsifier"</em> or <em>"preservative"</em>). Click a result to add it. It goes to the matching phase with a typical starting percentage.</p>
        ),
    },
    {
        target: 'sourcing',
        title: 'Missing something? Swap it',
        body: (
            <>
                <p>Your formula is checked against your <strong>Stash</strong>. Anything you don't have, or don't have enough of, is marked in the table with <strong>swap suggestions</strong> from your own shelf or to buy.</p>
                <p><strong>Print → Substitutions &amp; Sourcing</strong> gives you a shopping list with alternatives in case your shop doesn't carry an ingredient.</p>
            </>
        ),
    },
    {
        target: 'phases',
        title: '3. Fine-tune your phases',
        body: (
            <>
                <p>Ingredients are grouped by when they're added: <strong>A</strong> water, <strong>B</strong> oil, <strong>C</strong> cool-down (heat-sensitive actives, preservatives).</p>
                <ul className="list-disc pl-4 space-y-1">
                    <li>Type a <strong>%</strong>. The small range below it is the recommended usage, and it turns amber if you're outside it.</li>
                    <li>The <span className="text-blue-600 font-bold">Q.S.</span> ingredient (usually water) fills up whatever is left automatically.</li>
                    <li>Use ◀ ▶ to move an ingredient between phases, and click its name for details or to favorite it.</li>
                </ul>
            </>
        ),
    },
    {
        target: 'total',
        title: '4. Aim for exactly 100%',
        body: (
            <p>The total updates live. A yellow <span className="inline-flex w-4 h-4 bg-yellow-400 rounded-full text-[10px] text-white items-center justify-center align-middle">!</span> means your formula doesn't add up to 100% yet.</p>
        ),
    },
    {
        target: 'balance',
        title: 'Balance to 100% automatically',
        body: (
            <>
                <p><strong>Balance</strong> suggests logical percentages: preservative and chelator at safe levels, actives at their typical dose, emulsifier sized to your oils, and water filling the rest.</p>
                <p>You see every change and the reason before applying. Tick <strong>Auto</strong> to rebalance whenever you add or remove an ingredient; values you type yourself get a 🔒 so they're never overwritten.</p>
            </>
        ),
    },
    {
        target: 'companion',
        title: '5. Your formulation companion',
        body: (
            <p>Checks your formula against the selected profile as you work: missing preservatives, emulsifiers, pH conflicts and more. <strong>Resolve every warning</strong> to unlock sharing with the community.</p>
        ),
    },
    {
        target: 'claims',
        title: '6. Marketing claims',
        body: (
            <p>Want your product to be vegan, silicone-free or COSMOS-friendly? Select the claims and you'll be warned about any ingredient that breaks them.</p>
        ),
    },
    {
        target: 'recommendations',
        title: '7. Recommendations',
        body: <p>Suggestions for ingredients that could round out or improve your formula appear here.</p>,
    },
    {
        target: 'cost',
        title: '8. Know what it costs',
        body: <p>Uses the prices from your <strong>Stash</strong> and <strong>Containers</strong> to work out what the batch, and each filled container, costs you.</p>,
    },
    {
        target: 'actions',
        title: '9. Save, print & share',
        body: (
            <ul className="list-disc pl-4 space-y-1">
                <li><strong>Save</strong> happens automatically a moment after you stop typing (watch the status next to the button). Click the project name to rename it.</li>
                <li><strong>Clone</strong> makes a copy to try variations.</li>
                <li><strong>Print</strong> a lab batch ticket, a shopping list or a PIF.</li>
                <li><strong>Share</strong> publishes your recipe to the Community Hub.</li>
            </ul>
        ),
    },
    {
        target: 'favorites',
        title: 'Tip: Favorites',
        body: <p>Ingredients you ♥ show up here for one-click adding to future formulas.</p>,
    },
    {
        title: "You're all set! 🎉",
        body: (
            <p>Start by choosing a profile. You can replay this tour any time from the <strong>Guide</strong> button at the top of the page.</p>
        ),
    },
];
