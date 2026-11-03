import type { TourStep } from './GuidedTour';

export const STUDIO_TOUR_SEEN_KEY = 'formularium.studioTourSeen';

/** From this width the Studio menu is always showing down the left; below it, it opens from a button. */
export const STUDIO_WIDE_BREAKPOINT = 1024;

// Targets match the data-tour attributes in StudioPage, StudioLayout, StudioSidebar and Header.
// On a narrow screen the menu is a drawer, so the tour points at its button instead.
export function studioTourSteps(wide: boolean): TourStep[] {
    const menu: TourStep = wide
        ? {
            target: 'studio-sidebar',
            title: '3. Everything else is in this menu',
            body: (
                <>
                    <p>The Studio is more than the editor. From here you can reach:</p>
                    <ul className="list-disc pl-4 space-y-1">
                        <li><strong>Batches</strong>: log what you really make, and answer stability check-ins. A badge shows how many are due.</li>
                        <li><strong>My Stash</strong>: what you own, with amounts, prices and expiry dates.</li>
                        <li><strong>What can I make?</strong>: your stash matched against your formulas and community recipes, with swaps.</li>
                        <li><strong>Shopping List</strong>: one list for several formulas, with stash alerts.</li>
                        <li><strong>Containers</strong>, <strong>Calculators</strong> and <strong>Metrics</strong>.</li>
                        <li><strong>Ingredients Library</strong>, and <strong>Settings</strong> (currency, alerts, where you plan to sell).</li>
                    </ul>
                </>
            ),
        }
        : {
            target: 'studio-menu',
            title: '3. Everything else is in the menu',
            body: (
                <>
                    <p>Tap this button to open the Studio menu. It holds <strong>Batches</strong>, <strong>My Stash</strong>, <strong>What can I make?</strong>, the <strong>Shopping List</strong>, <strong>Containers</strong>, <strong>Calculators</strong>, <strong>Metrics</strong>, the <strong>Ingredients Library</strong> and <strong>Settings</strong>.</p>
                </>
            ),
        };

    return [
        {
            title: 'Welcome to your Studio 🧪',
            body: (
                <>
                    <p>This is home base: your formulas, your stash, your batches and your tools, all in one place. A quick tour will show you around.</p>
                    <p className="text-xs text-gray-500">Takes about a minute. Use ← → on your keyboard, or Esc to skip.</p>
                </>
            ),
        },
        {
            target: 'studio-new',
            title: '1. Start a formula',
            body: (
                <>
                    <p>Press this to begin a new formula. You choose what you are making, such as a <strong>light lotion</strong>, <strong>toner</strong>, <strong>body butter</strong> or <strong>shampoo</strong>, and get a pre-filled, auto-balanced starting point. Or start from a blank page.</p>
                    <p>Beginners: a template is the easiest way in.</p>
                </>
            ),
        },
        {
            target: 'studio-formulas',
            title: '2. Your formulas live here',
            body: (
                <>
                    <p>Every formula you save appears as a card, with its status, batch size, product profile and date.</p>
                    <ul className="list-disc pl-4 space-y-1">
                        <li>Click a card to open it in the editor.</li>
                        <li>Hover over a card for the <strong>Edit</strong> and <strong>Delete</strong> buttons.</li>
                    </ul>
                    <p>Inside a formula, <strong>More</strong> lets you clone it, save versions with a note on what you changed, and compare them.</p>
                </>
            ),
        },
        menu,
        {
            target: 'header',
            title: '4. The top bar',
            body: (
                <>
                    <p>The bar along the top follows you everywhere:</p>
                    <ul className="list-disc pl-4 space-y-1">
                        <li><strong>Community</strong>: browse and clone other people's recipes, or share your own.</li>
                        <li><strong>Tools</strong>: calculators for HLB, pH, dilutions, preservatives and units.</li>
                        <li><strong>Learn</strong> and <strong>Blog</strong>: guides, a glossary and troubleshooting.</li>
                        <li>The <strong>bell</strong> shows replies and notifications, and your <strong>profile</strong> holds sign out.</li>
                    </ul>
                </>
            ),
        },
        {
            title: "You're all set",
            body: (
                <>
                    <p>A good first step is to press <strong>+ New Formulation</strong> and pick a template. The editor has its own <strong>Guide</strong> button that explains each part of the page.</p>
                    <p className="text-xs text-gray-500">You can replay this tour any time with the <strong>Tour</strong> button.</p>
                </>
            ),
        },
    ];
}
