import type { ReactNode } from 'react';
import type { TourStep } from './GuidedTour';

export const STUDIO_TOUR_SEEN_KEY = 'formularium.studioTourSeen';

/** From this width the Studio menu is always showing down the left; below it, it opens from a button. */
export const STUDIO_WIDE_BREAKPOINT = 1024;

interface NavItem {
    /** The data-tour value of the sidebar entry. */
    target: string;
    /** The label on the sidebar entry. */
    label: string;
    /** One sentence, for the narrow-screen step where the entries are hidden in a drawer. */
    short: string;
    body: ReactNode;
}

// In the order they appear in the sidebar. Targets match the data-tour attributes in StudioSidebar.
export const NAV_ITEMS: NavItem[] = [
    {
        target: 'nav-batches',
        label: 'Batches',
        short: 'Log what you really make, and answer stability check-ins.',
        body: (
            <>
                <p>A <strong>batch</strong> is a formula you actually made. In the editor, press <strong>Make batch</strong> to log one: pick the size (or a container), a lot number, and whether to take the ingredients out of your stash.</p>
                <ul className="list-disc pl-4 space-y-1">
                    <li>The app asks <em>"how does it look?"</em> at <strong>24 hours, 1 week, 4 weeks and 12 weeks</strong>. The badge on this entry shows how many are due.</li>
                    <li>Add the check-ins to your phone's calendar, or use <strong>Bench mode</strong>, a full-screen view for weighing with ticks and timers.</li>
                    <li>Each batch records its cost and can be printed as a quality record, undone (which puts your stash back), discarded or deleted.</li>
                </ul>
            </>
        ),
    },
    {
        target: 'nav-stash',
        label: 'My Stash',
        short: 'Everything you own, with amounts, prices and expiry dates.',
        body: (
            <>
                <p>Your shelf, as <strong>lots</strong>: what is left of each ingredient, its supplier, lot number, price and expiry date. Add stock by searching the ingredient library.</p>
                <ul className="list-disc pl-4 space-y-1">
                    <li>Lots past their date turn <span className="text-red-600 font-bold">red</span>. Lots expiring soon turn <span className="text-orange-600 font-bold">orange</span>; you choose how soon in Settings.</li>
                    <li>The price you enter becomes a price per gram, which is how batch costs are worked out.</li>
                    <li>Everything else uses it: swap suggestions in the editor, batch plans, <strong>What can I make?</strong>, the shopping list and Metrics.</li>
                </ul>
            </>
        ),
    },
    {
        target: 'nav-pantry',
        label: 'What can I make?',
        short: 'Matches your stash against your formulas and community recipes.',
        body: (
            <>
                <p>Compares your stash with your own formulas and the newest community recipes, and ranks them by <strong>how much of each you already have</strong>.</p>
                <ul className="list-disc pl-4 space-y-1">
                    <li>Anything missing gets a <strong>stand-in from your own stash</strong> where one is close enough, with a note on how well it fits.</li>
                    <li>A water-based recipe with no preservative to use gets a clear warning.</li>
                    <li>Set a batch size, filter to Mine or Community, and for a community recipe <strong>clone it as is, or with the swaps already applied</strong>.</li>
                </ul>
            </>
        ),
    },
    {
        target: 'nav-shopping',
        label: 'Shopping List',
        short: 'One combined list for several formulas, with stash alerts.',
        body: (
            <>
                <p>Tick several formulas, set a batch size for each, and get <strong>one shopping list</strong>: how much of each ingredient you need in total, how much you have, and how much to buy.</p>
                <ul className="list-disc pl-4 space-y-1">
                    <li>Each row says which recipes need it, and whether your stock covers each one, only part of it, or none.</li>
                    <li>Stash alerts show what has <strong>expired</strong>, is <strong>expiring soon</strong> or is <strong>running low</strong>.</li>
                    <li>Print it when you go shopping.</li>
                </ul>
            </>
        ),
    },
    {
        target: 'nav-containers',
        label: 'Containers',
        short: 'Your bottles, jars and tubes, with stock and cost.',
        body: (
            <>
                <p>Your packaging inventory: each bottle, jar or tube with its type, material, volume, supplier, how many you have in stock and what one costs. Set a level to be warned when you are running out.</p>
                <p>When you make a batch, pick a container and the <strong>batch size follows how many it fills</strong>, with the cost of the packaging included in the cost per container.</p>
            </>
        ),
    },
    {
        target: 'nav-tools',
        label: 'Calculators',
        short: 'HLB, pH, dilution, preservative and unit calculators.',
        body: (
            <>
                <p>Five calculators for the arithmetic you would otherwise do on paper:</p>
                <ul className="list-disc pl-4 space-y-1">
                    <li><strong>HLB blend</strong>: the right emulsifier mix for your oils.</li>
                    <li><strong>pH adjuster</strong>: scale a small test up to a whole batch.</li>
                    <li><strong>Dilution</strong>, <strong>Preservative</strong> (grams for your batch) and <strong>Units</strong> (grams, ounces, millilitres, temperatures).</li>
                </ul>
            </>
        ),
    },
    {
        target: 'nav-metrics',
        label: 'Metrics',
        short: 'Your habits in numbers: ingredients, costs, frequency, stability.',
        body: (
            <>
                <p>Your making, in numbers. Choose <strong>all time, 12 months, 90 days or 30 days</strong> to see:</p>
                <ul className="list-disc pl-4 space-y-1">
                    <li>Batches, grams made, total spend and cost per batch.</li>
                    <li>Your most used ingredients, formulas and containers, and your favourite ingredients.</li>
                    <li>How your stability check-ins went, plus yield and waste.</li>
                    <li>Stash that is <strong>sitting idle</strong>, and a few plain-language highlights.</li>
                </ul>
            </>
        ),
    },
    {
        target: 'nav-library',
        label: 'Ingredients Library',
        short: 'The full ingredient catalog, with your favourites and your own.',
        body: (
            <>
                <p>The whole catalog. Search by trade or INCI name, and filter by function, solubility or a claim such as vegan.</p>
                <ul className="list-disc pl-4 space-y-1">
                    <li>Each ingredient shows its usual and allowed usage rate, working pH range, charge and notes.</li>
                    <li>Star the ones you reach for most. They appear in the editor's favourites menu.</li>
                    <li><strong>+ Custom Ingredient</strong> adds one that is not in the catalog.</li>
                </ul>
            </>
        ),
    },
    {
        target: 'nav-settings',
        label: 'Settings',
        short: 'Your name, currency, alert levels, where you plan to sell, and your data.',
        body: (
            <>
                <p>Settings that change how the whole app behaves:</p>
                <ul className="list-disc pl-4 space-y-1">
                    <li>Your <strong>display name</strong>, <strong>currency</strong> and <strong>date format</strong>.</li>
                    <li>How soon an <strong>expiry</strong> warning appears, and the <strong>low-stock level</strong>.</li>
                    <li><strong>Where you plan to sell</strong>: the editor then warns when an ingredient is above that region's legal limit.</li>
                    <li><strong>Export your data</strong>, or delete your account.</li>
                </ul>
            </>
        ),
    },
];

// Targets match the data-tour attributes in StudioPage, StudioLayout, StudioSidebar and Header.
// On a narrow screen the menu is a drawer, so its entries cannot be pointed at one by one: the tour points at the
// menu button and describes them all in a single step instead.
export function studioTourSteps(wide: boolean): TourStep[] {
    const menu: TourStep[] = wide
        ? [
            {
                target: 'studio-sidebar',
                title: '3. Your menu',
                body: (
                    <>
                        <p>Everything outside the editor is in this menu, roughly in the order you will use it: record what you own, find out what you can make, plan the shopping, make batches, then review how it went.</p>
                        <p>The next steps take each entry in turn. You are on <strong>My Formulations</strong> now, the Studio home.</p>
                    </>
                ),
            },
            ...NAV_ITEMS.map<TourStep>(item => ({ target: item.target, title: `Menu: ${item.label}`, body: item.body })),
        ]
        : [
            {
                target: 'studio-menu',
                title: '3. Your menu',
                body: (
                    <>
                        <p>Tap this button to open the menu. It holds:</p>
                        <ul className="list-disc pl-4 space-y-1.5">
                            {NAV_ITEMS.map(item => <li key={item.target}><strong>{item.label}</strong>: {item.short}</li>)}
                        </ul>
                    </>
                ),
            },
        ];

    return [
        {
            title: 'Welcome to your Studio 🧪',
            body: (
                <>
                    <p>This is home base: your formulas, your stash, your batches and your tools, all in one place. A quick tour will show you around.</p>
                    <p className="text-xs text-gray-500">Use ← → on your keyboard, or Esc to skip.</p>
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
        ...menu,
        {
            target: 'header',
            title: '4. The top bar',
            body: (
                <>
                    <p>The bar along the top follows you everywhere:</p>
                    <ul className="list-disc pl-4 space-y-1">
                        <li><strong>Community</strong>: browse and clone other people's recipes, or share your own.</li>
                        <li><strong>Tools</strong>: the calculators, also reachable without signing in.</li>
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
