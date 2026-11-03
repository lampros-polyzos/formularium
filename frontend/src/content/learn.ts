import type { ChecklistGroup, CheatSheet, FaqItem, GlossaryEntry, LearningStep, TroubleshootingItem } from './types';

// ---------- Learning path ----------

export const LEARNING_PATH: LearningStep[] = [
    {
        title: `Learn the language`,
        text: `Formulating has its own vocabulary: phases, INCI, HLB, Q.S. A few minutes here saves hours of confusion later.`,
        links: [
            { label: `Browse the glossary`, to: `/learn?tab=glossary` },
            { label: `How to read an INCI list`, to: `/blog/read-an-inci-list` },
        ],
    },
    {
        title: `Set up a clean, safe workspace`,
        text: `Accurate scale, distilled water, sanitiser and a handful of basic tools. Hygiene is the difference between a product and a petri dish.`,
        links: [
            { label: `Home lab starter kit`, to: `/blog/home-lab-starter-kit` },
            { label: `Safety checklist`, to: `/learn?tab=safety` },
        ],
    },
    {
        title: `Understand your building blocks`,
        text: `Humectants, emollients, occlusives, thickeners, actives: know what each family does so you can choose, and substitute, with confidence.`,
        links: [
            { label: `How a moisturizer works`, to: `/blog/humectants-emollients-occlusives` },
            { label: `Usage-rate cheat sheet`, to: `/learn?tab=cheatsheets` },
        ],
    },
    {
        title: `Master emulsions and preservation`,
        text: `Most skincare is an emulsion, and almost all of it needs a preservative. These two topics cover the majority of what can go wrong.`,
        links: [
            { label: `Emulsions explained`, to: `/blog/emulsions-explained` },
            { label: `Preservatives 101`, to: `/blog/preservatives-101` },
        ],
    },
    {
        title: `Make your first small batch`,
        text: `Follow a simple, forgiving recipe at 100 g. Weigh carefully, follow the phases and write everything down.`,
        links: [
            { label: `First lotion, step by step`, to: `/blog/first-lotion-step-by-step` },
            { label: `Open the Studio`, to: `/studio/new` },
        ],
    },
    {
        title: `Test, troubleshoot and iterate`,
        text: `Check pH, wait 24 hours, run a patch test and change one variable at a time. When something goes wrong, there is usually a known fix.`,
        links: [
            { label: `Why pH matters`, to: `/blog/why-ph-matters` },
            { label: `Troubleshooting guide`, to: `/learn?tab=troubleshooting` },
        ],
    },
];

// ---------- Glossary ----------

const RAW_GLOSSARY: GlossaryEntry[] = [
    { term: `Active`, definition: `An ingredient included for a specific skin or hair benefit, such as niacinamide for tone or panthenol for soothing, as opposed to ingredients that give texture, stability or preservation.` },
    { term: `Anhydrous`, definition: `A formula that contains no water, such as body butters, balms and oil serums. Microbes cannot grow easily without water, but any water that gets in (wet fingers) changes that. They still need an antioxidant to slow rancidity.` },
    { term: `Antioxidant (formulation)`, definition: `Protects oils from going rancid by slowing oxidation. Tocopherol (vitamin E) is the usual choice. It is not the same as a preservative.`, article: `preservatives-101` },
    { term: `Aqua`, definition: `The INCI name for water.` },
    { term: `Batch log`, definition: `A record of every batch: date, lot number, ingredient weights, temperatures, observations and test results. Your best debugging tool.` },
    { term: `Broad-spectrum`, definition: `A preservative or preservative system that protects against bacteria, yeast and mold.`, article: `preservatives-101` },
    { term: `Carrier oil`, definition: `A plant oil (jojoba, sweet almond, argan) used as the main oil in a formula, or to dilute strong ingredients such as essential oils.` },
    { term: `CAS number`, definition: `A unique numeric identifier for a chemical substance. Handy for searching suppliers and safety data sheets.` },
    { term: `Coalescence`, definition: `Droplets of an emulsion merging into bigger ones for good, until oil or water visibly separates. It usually means the emulsifier system is too weak, and it cannot be undone.`, article: `thickeners-and-stable-emulsions` },
    { term: `Creaming`, definition: `Oil droplets drifting to the top of a lotion because they are lighter than water (in a water-in-oil cream the water sinks instead). It looks like a thicker layer over a thinner one, and a good shake brings it back. Smaller droplets and a thicker water phase slow it down.`, article: `thickeners-and-stable-emulsions` },
    { term: `Challenge test`, definition: `A laboratory test that deliberately contaminates a product with microbes to prove the preservative system keeps them under control. The standard evidence that a product is properly preserved.`, article: `preservatives-101` },
    { term: `Chelating agent`, definition: `Binds metal ions such as calcium and iron that can destabilise a formula or weaken the preservative. Disodium EDTA and phytic acid are common examples.` },
    { term: `Co-emulsifier`, definition: `A helper that strengthens an emulsion and adds body, usually a fatty alcohol such as cetyl or cetearyl alcohol.`, article: `emulsions-explained` },
    { term: `Comedogenic rating`, definition: `A 0-5 scale estimating how likely an ingredient is to clog pores. A rough guide only, since concentration and the rest of the formula matter.`, article: `humectants-emollients-occlusives` },
    { term: `Cool-down phase (Phase C)`, definition: `The last stage of making a product. Once the emulsion has cooled (typically below 40°C) you stir in heat-sensitive ingredients such as the preservative, actives, extracts and fragrance.` },
    { term: `COSMOS`, definition: `A European standard certifying natural and organic cosmetics, with its own rules on allowed ingredients and processing.` },
    { term: `CPSR`, definition: `Cosmetic Product Safety Report: a safety assessment written by a qualified assessor, required in the EU and UK before a cosmetic is sold.`, article: `selling-your-formulas` },
    { term: `Electrolyte`, definition: `Salts and charged ingredients (aloe powder, sodium PCA, mineral salts) that can thin or collapse some gels and emulsions.` },
    { term: `Emollient`, definition: `Softens and smooths the skin by filling the gaps between skin cells. Includes oils, esters and butters.`, article: `humectants-emollients-occlusives` },
    { term: `Emulsifier`, definition: `A molecule with a water-loving end and an oil-loving end that lets oil and water mix as a stable emulsion.`, article: `emulsions-explained` },
    { term: `Emulsion`, definition: `A mixture of two liquids that normally do not mix, usually oil and water, with one dispersed as tiny droplets in the other. See O/W and W/O emulsion.`, article: `emulsions-explained` },
    { term: `Fatty alcohol`, definition: `Waxy alcohols such as cetyl alcohol and cetearyl alcohol that thicken and stabilise emulsions. They are not drying like ethanol.` },
    { term: `Flocculation`, definition: `Droplets sticking together in clusters without merging. It is reversible, but clusters cream faster and lead to coalescence. It often looks grainy or lumpy.`, article: `thickeners-and-stable-emulsions` },
    { term: `HLB`, definition: `Hydrophilic-Lipophilic Balance: a 0-20 scale for how water- or oil-loving an emulsifier is. Low HLB (about 3-6) suits W/O emulsions; higher HLB (about 8-18) suits O/W.`, article: `emulsions-explained` },
    { term: `Humectant`, definition: `Attracts and holds water. Examples: glycerin, propanediol, sodium PCA, hyaluronic acid, panthenol.`, article: `humectants-emollients-occlusives` },
    { term: `Hydrosol`, definition: `The water left over from steam-distilling a plant (rose water, witch hazel). Water-based, so it needs preserving, and it is heat-sensitive.` },
    { term: `INCI`, definition: `International Nomenclature of Cosmetic Ingredients: the standard names used on labels worldwide. Use INCI names, not trade names, when searching suppliers.`, article: `read-an-inci-list` },
    { term: `Ionic charge`, definition: `Whether an ingredient is anionic (negative), cationic (positive), non-ionic or amphoteric. Opposite charges can clash: for example, cationic conditioners with anionic thickeners can form a gummy mess.` },
    { term: `Occlusive`, definition: `Forms a protective film that slows water loss from the skin. Examples: butters, waxes, petrolatum, silicones.`, article: `humectants-emollients-occlusives` },
    { term: `O/W emulsion`, definition: `Oil-in-water: oil droplets dispersed in water. Lotions and light creams. They feel light and wash off easily.`, article: `emulsions-explained` },
    { term: `Ostwald ripening`, definition: `A slow process in which small droplets shrink and large ones grow, so an emulsion turns coarser over weeks and months. Fine, even droplets from good mixing at the start are the best defence.`, article: `thickeners-and-stable-emulsions` },
    { term: `Overage`, definition: `Extra material made or bought to cover losses on beakers and tools, typically 10-15%.` },
    { term: `PAO`, definition: `Period After Opening: the open-jar symbol with a number of months showing how long a product stays good after it is first opened.` },
    { term: `Patch test`, definition: `Applying a small amount of product to a discreet area (such as the inner forearm) for 24-48 hours to check for a reaction before wider use.` },
    { term: `pH`, definition: `A 0-14 measure of acidity. Healthy skin sits around 4.7-5.75, and most leave-on products aim for pH 4.5-6.`, article: `why-ph-matters` },
    { term: `pH adjuster`, definition: `An acid or base added in small amounts to bring a formula to its target pH. Citric or lactic acid lowers it; arginine or a dilute sodium hydroxide solution raises it.`, article: `why-ph-matters` },
    { term: `Phase`, definition: `A group of ingredients prepared together. Typically Phase A is the water phase, Phase B the oil phase and Phase C the cool-down phase.` },
    { term: `Preservative`, definition: `Prevents bacteria, yeast and mold from growing in a product. Required in anything that contains water.`, article: `preservatives-101` },
    { term: `Preservative booster`, definition: `A multifunctional ingredient (pentylene glycol, caprylyl glycol, 1,2-hexanediol) that strengthens a preservative. Should not be relied on alone.`, article: `preservatives-101` },
    { term: `Q.S.`, definition: `Quantum satis, Latin for "as much as needed". The ingredient (usually water) that fills the formula up to 100% after everything else is weighed.` },
    { term: `Rheology modifier`, definition: `Controls thickness and flow: gums, polymers, clays and fatty alcohols. Also called a thickener.`, article: `thickeners-and-stable-emulsions` },
    { term: `SDS / CoA`, definition: `Safety Data Sheet: handling and hazard information. Certificate of Analysis: test results for a specific lot. Ask your supplier for both.` },
    { term: `Shear-thinning`, definition: `Gets thinner while you push, stir or rub it, and thickens again when you stop. Ketchup and good lotions do this: stable in the jar, easy to spread.`, article: `thickeners-and-stable-emulsions` },
    { term: `Solubilizer`, definition: `Lets oil-soluble ingredients such as essential oils disperse clearly in water. Examples: Polysorbate 20, Polyglyceryl-4 Caprate.` },
    { term: `Stability test`, definition: `Storing samples under different conditions (room temperature, fridge, a warm place around 40°C, light) for weeks to see whether look, smell, pH and texture hold up.` },
    { term: `Surfactant`, definition: `A cleansing ingredient that lifts oil and dirt into water. Anionic surfactants foam strongly, amphoteric ones are milder and boost foam, and non-ionic ones are very gentle.` },
    { term: `Viscosity`, definition: `How thick or runny a product is. Water is thin, honey is thick. It is measured in mPa·s.`, article: `thickeners-and-stable-emulsions` },
    { term: `W/O emulsion`, definition: `Water-in-oil: water droplets dispersed in oil. Richer and more protective than O/W. Cold creams and salves.`, article: `emulsions-explained` },
    { term: `Wax`, definition: `A solid lipid that adds firmness and structure: beeswax, candelilla, carnauba. Used in balms, lip products and sticks.` },
    { term: `Yield stress`, definition: `The push a product needs before it will start to flow. Below it, the product acts like a soft solid, which is what keeps droplets from rising or sinking in a lotion.`, article: `thickeners-and-stable-emulsions` },
    { term: `w/w`, definition: `Weight per weight: percentages calculated by weight. This is how formulas are written, so always weigh rather than measure by volume.` },
];

export const GLOSSARY: GlossaryEntry[] = [...RAW_GLOSSARY].sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));

// ---------- Cheat sheets ----------

export const CHEAT_SHEETS: CheatSheet[] = [
    {
        id: 'usage-rates',
        title: `Typical usage rates`,
        intro: `Starting ranges by ingredient function. Always check the supplier datasheet and the usage range shown in the ingredient library.`,
        headers: [`Function`, `Typical range`, `Examples`, `Good to know`],
        rows: [
            [`Humectant`, `1-5% (up to about 10% in toners)`, `Glycerin, propanediol, sodium PCA`, `Above about 5% in a cream it can feel sticky`],
            [`O/W emulsifier`, `2-5%`, `Olivem 1000 (1.5-5%), Arlacel 165 (1-5%)`, `More oil needs more emulsifier`],
            [`Fatty alcohol`, `1-5%`, `Cetyl alcohol, cetearyl alcohol`, `Adds body and stability`],
            [`Oils and butters (total)`, `10-20% lotion, 20-30% cream`, `Jojoba, shea butter, squalane`, `Anhydrous products use much more`],
            [`Gum thickener`, `0.1-1%`, `Xanthan gum, sclerotium gum`, `Pre-mix with glycerin to avoid lumps`],
            [`Chelator`, `0.05-0.2%`, `Disodium EDTA, phytic acid`, `Helps preservatives work`],
            [`Antioxidant`, `0.1-1%`, `Tocopherol (vitamin E)`, `Protects oils, not a preservative`],
            [`Broad-spectrum preservative`, `Per datasheet, often 0.5-1.5%`, `Euxyl PE 9010 (0.5-1.1%), Euxyl K712 (0.5-1.5%)`, `Check pH range and maximum temperature`],
            [`Essential oil / fragrance`, `0.1-1% on the face, up to about 2% on the body`, `Lavender, sweet orange`, `Follow IFRA and supplier guidance; some oils are phototoxic`],
            [`Skin actives`, `0.1-5%, depending on the active`, `Panthenol 1-5%, niacinamide 2-5%, allantoin 0.1-0.5%`, `Each has its own pH window`],
            [`Surfactants (cleansers)`, `10-20% total`, `Cocoyl glutamate, coco-glucoside, CAPB`, `Blend a gentle primary with an amphoteric booster`],
        ],
        note: `Ranges are general starting points, not guarantees of safety. They mirror the usage ranges in the Formularium ingredient library.`,
    },
    {
        id: 'ph-targets',
        title: `Target pH guide`,
        intro: `Where to aim for common products and actives.`,
        headers: [`Product or ingredient`, `Target pH`, `Why`],
        rows: [
            [`Healthy skin surface`, `4.7-5.75`, `The skin's slightly acidic protective layer`],
            [`Lotion or cream`, `4.5-6`, `Comfortable for skin, works with most preservatives`],
            [`Toner or face mist`, `4.5-5.5`, `Stays close to the skin's own pH`],
            [`Shampoo`, `4.5-6`, `Keeps the hair cuticle smooth`],
            [`Conditioner (cationic)`, `4-5.5`, `Cationic conditioners need an acidic pH`],
            [`Gentle body wash`, `4.5-6.5`, `Mild surfactants work in this range`],
            [`Niacinamide`, `5-6`, `Below 5 it can convert to nicotinic acid and cause flushing`],
            [`AHA exfoliants (lactic, glycolic)`, `3.5-4.5`, `Free acid is only active at lower pH`],
            [`L-ascorbic acid (vitamin C)`, `2.5-3.5`, `Needs a very acidic pH to be stable and effective`],
            [`Sodium benzoate / potassium sorbate`, `Below 5.5`, `The preservative fails above this pH`],
            [`Sodium dehydroacetate`, `Up to 6.5`, `Inactive above this pH`],
        ],
    },
    {
        id: 'phase-map',
        title: `The phase map`,
        intro: `What goes where in a typical emulsion.`,
        headers: [`Phase`, `Contains`, `What you do`],
        rows: [
            [`A: water`, `Water, humectants, gums, chelator, heat-stable water-soluble ingredients`, `Heat to 70-75°C`],
            [`B: oil`, `Oils, butters, waxes, emulsifier, fatty alcohol`, `Heat to 70-75°C and hold for about 20 minutes`],
            [`Combine`, `B into A`, `Blend with a stick blender in short bursts, then stir while it cools`],
            [`C: cool-down`, `Preservative, extracts, peptides, vitamins, fragrance, volatile actives`, `Add below about 40°C, checking each ingredient's maximum temperature`],
        ],
    },
    {
        id: 'starting-proportions',
        title: `Starting proportions by product type`,
        intro: `Rough building proportions to start from. They are not rules, so adapt them to your ingredients.`,
        headers: [`Product`, `Water`, `Oils and butters`, `Other`],
        rows: [
            [`Light lotion`, `65-75%`, `10-20% including emulsifier`, `Humectant 2-5%, thickener 0.1-0.5%, preservative per datasheet, actives 2-8%`],
            [`Rich cream`, `55-70%`, `20-30% including emulsifier`, `Humectant 2-5%, fatty alcohol 2-5%`],
            [`Toner`, `85-95%`, `Only a drop of oil, with solubilizer`, `Humectant 2-5%, actives 1-5%, preservative`],
            [`Gel serum`, `80-95%`, `None`, `Humectant 2-8%, gelling agent 0.2-1%, actives, preservative`],
            [`Body butter`, `None`, `Butters 40-60%, liquid oils 30-50%`, `Optional arrowroot 5-10%, antioxidant 0.5%`],
            [`Facial oil`, `None`, `Carrier oils 90-99%`, `Antioxidant 0.5-1%, essential oil under 1%`],
        ],
    },
];

// ---------- Troubleshooting ----------

export const TROUBLESHOOTING: TroubleshootingItem[] = [
    {
        id: 'separation',
        problem: `My cream or lotion separates`,
        causes: [
            `Not enough emulsifier for the amount of oil`,
            `Phases at very different temperatures when combined`,
            `Too little mixing energy`,
            `Electrolytes (aloe powder, salts, sodium PCA) or a pH outside the emulsifier's range`,
        ],
        fixes: [
            `Increase the emulsifier slightly, or lower the oil phase`,
            `Keep both phases within a few degrees of each other and blend in short bursts`,
            `Add 1-3% fatty alcohol and 0.1-0.3% xanthan gum for stability`,
            `Check the emulsifier's recommended pH range and any electrolyte-sensitive ingredients`,
        ],
        article: `emulsions-explained`,
    },
    {
        id: 'grainy',
        problem: `It feels grainy or gritty`,
        causes: [
            `Butters (especially shea) were cooled slowly, so fractions crystallise`,
            `Butters or waxes were not melted completely`,
            `Mixing butters with very different melting points`,
        ],
        fixes: [
            `Melt butters fully at 80°C or above and hold for 15-20 minutes`,
            `Cool quickly (fridge or ice bath) while stirring`,
            `Add a little fatty alcohol or a liquid oil to smooth the crystals`,
        ],
    },
    {
        id: 'too-thin',
        problem: `It is too thin or watery`,
        causes: [
            `Not enough thickener or fatty alcohol`,
            `You judged it too soon: viscosity builds for 24-48 hours`,
            `Electrolytes broke a gel`,
        ],
        fixes: [
            `Wait 24-48 hours before changing anything`,
            `Add 1-2% cetyl or cetearyl alcohol in the next batch`,
            `Add 0.1-0.3% xanthan gum, hydrated in glycerin first`,
        ],
    },
    {
        id: 'too-thick',
        problem: `It is too thick, gummy or stringy`,
        causes: [
            `Too much gum or thickener`,
            `Too much fatty alcohol or wax`,
        ],
        fixes: [
            `Reduce the gum (xanthan gets stringy above about 0.5%)`,
            `Reduce fatty alcohol or wax by about 0.5% at a time`,
            `Add a light emollient to loosen the feel`,
        ],
    },
    {
        id: 'sticky',
        problem: `It feels sticky or tacky`,
        causes: [`Too much glycerin or other humectant`, `Gel polymer residue`],
        fixes: [
            `Keep glycerin under about 5% in leave-ons`,
            `Swap some glycerin for propanediol or a lighter humectant`,
            `Add 1-3% arrowroot or tapioca starch to cut the tack`,
        ],
        article: `humectants-emollients-occlusives`,
    },
    {
        id: 'greasy',
        problem: `It feels greasy or heavy`,
        causes: [`Too many butters or oils`, `Heavy occlusives for the skin type or climate`],
        fixes: [
            `Reduce butters and waxes`,
            `Use lighter emollients such as squalane or caprylic/capric triglyceride`,
            `Add a powder such as arrowroot or tapioca starch`,
        ],
        article: `humectants-emollients-occlusives`,
    },
    {
        id: 'mold-smell',
        problem: `I see mold, or it smells off`,
        causes: [
            `No preservative, or too little of it`,
            `Preservative used outside its pH range or added when too hot`,
            `Contaminated tools, tap water or fingers in the jar`,
        ],
        fixes: [
            `Throw it away: do not try to save a contaminated batch`,
            `Use a broad-spectrum preservative at the supplier's rate, and check pH`,
            `Sanitise everything, use distilled water and a spatula, and make smaller batches`,
        ],
        article: `preservatives-101`,
    },
    {
        id: 'rancid',
        problem: `The oils smell rancid or it changed colour`,
        causes: [`Oxidation of oils`, `Heat, light or air exposure`, `Old oils`],
        fixes: [
            `Add 0.5-1% tocopherol`,
            `Use fresh oils and avoid unnecessary heating`,
            `Store in opaque or airless packaging`,
        ],
    },
    {
        id: 'gel-collapse',
        problem: `My gel turned watery`,
        causes: [
            `Electrolytes (aloe powder, sodium PCA, salts) broke a polymer`,
            `pH outside the gelling agent's range`,
        ],
        fixes: [
            `Use a salt-tolerant thickener such as sclerotium gum or Sepimax Zen`,
            `Reduce electrolytes`,
            `Check pH against the gelling agent's datasheet`,
        ],
    },
    {
        id: 'lumps',
        problem: `The thickener formed lumps`,
        causes: [`Dry gum sprinkled straight onto water`],
        fixes: [
            `Pre-disperse the gum in glycerin or a little oil, then add to the water`,
            `Use a stick blender for high shear`,
            `Allow time to hydrate: some polymers need to rest overnight`,
        ],
    },
    {
        id: 'cloudy-toner',
        problem: `My toner is cloudy after adding essential oil`,
        causes: [`Not enough solubilizer for the oil`],
        fixes: [
            `Pre-mix the oil with several times its weight of solubilizer (often 3-5 times) before adding to the water`,
            `Use less oil`,
            `Stir gently to avoid foam`,
        ],
    },
    {
        id: 'ph-drift',
        problem: `The pH changed after a day`,
        causes: [`Reactive ingredients (zinc oxide raises pH, gluconolactone lowers it)`, `No buffer`],
        fixes: [
            `Re-measure after 24 hours and adjust`,
            `Use a buffer system, such as lactic acid with sodium lactate`,
        ],
        article: `why-ph-matters`,
    },
    {
        id: 'irritation',
        problem: `It stings or makes my skin red`,
        causes: [
            `pH too low or too high`,
            `Essential oils or fragrance`,
            `Too high a level of an active (AHA, retinol, vitamin C)`,
        ],
        fixes: [
            `Stop using it`,
            `Check pH and active levels against their usage ranges`,
            `Reduce or remove fragrance, and always patch test`,
        ],
    },
];

// ---------- Safety ----------

export const SAFETY_CHECKLIST: ChecklistGroup[] = [
    {
        title: `Keep it clean`,
        items: [
            `Sanitise surfaces, tools and containers with 70% isopropyl alcohol and let them air-dry`,
            `Tie back hair and wear gloves`,
            `Use distilled or deionised water, never tap water`,
            `Use a clean spatula instead of fingers, even at home`,
        ],
    },
    {
        title: `Preserve properly`,
        items: [
            `Every product containing water needs a broad-spectrum preservative`,
            `Respect the preservative's usage rate, pH range and maximum temperature`,
            `Keep anhydrous products free of water and add an antioxidant`,
            `Make small batches and discard anything that changes smell, colour or texture`,
        ],
    },
    {
        title: `Handle ingredients with care`,
        items: [
            `Wear a mask for fine powders such as SLSA, clays and mica`,
            `Wear gloves and eye protection for acids and sodium hydroxide, and always add them to water, not the other way around`,
            `Dilute essential oils and check for phototoxic types (some citrus oils)`,
            `Keep alcohol and other flammables away from heat`,
        ],
    },
    {
        title: `Test before you trust`,
        items: [
            `Patch test on the inner forearm for 24-48 hours`,
            `Check pH and let the batch rest 24 hours`,
            `Store samples at room temperature, in the fridge and somewhere warm to watch for changes`,
            `Introduce one new ingredient at a time`,
        ],
    },
    {
        title: `Keep records`,
        items: [
            `Write a batch log with date, lot number, weights and results`,
            `Label containers with name, date and batch number`,
            `Keep supplier SDS and CoA documents`,
        ],
    },
];

// ---------- FAQ ----------

export const FAQ: FaqItem[] = [
    { q: `Do I need a preservative in every product?`, a: `Any product containing water, or likely to get wet (like a body butter in a shower), needs a broad-spectrum preservative. Truly anhydrous products such as balms and oil blends do not, but they should still contain an antioxidant.` },
    { q: `Can I use tap water?`, a: `No. Tap water contains minerals and microbes that can destabilise your product and weaken the preservative. Use distilled or deionised water.` },
    { q: `Can I use kitchen ingredients like honey, fruit or milk?`, a: `They are risky. Food ingredients feed microbes and are very hard to preserve reliably, so they are best kept for the kitchen.` },
    { q: `How long will my product last?`, a: `Without stability and challenge testing, treat it as short-lived. Make small batches, keep them clean and cool, and aim to use them within a few months. Throw away anything that changes smell, colour or texture.` },
    { q: `Why do I need a scale and not measuring spoons?`, a: `Formulas are percentages by weight. A spoonful of butter and a spoonful of glycerin weigh very different amounts, so volume measurements give unreliable results. A 0.01 g scale fixes that.` },
    { q: `What is the difference between an INCI name and a trade name?`, a: `The INCI name is the standard ingredient name used on labels (for example Butyrospermum Parkii Butter). A trade name is a supplier's brand name for it (for example Shea Butter). Always search by INCI.` },
    { q: `Is "natural" better or safer?`, a: `Not automatically. "Natural" is not a regulated safety term, and many natural ingredients (essential oils, some extracts) are common allergens. Judge ingredients by evidence and usage level.` },
    { q: `How do I know how much preservative to use?`, a: `Follow the supplier's datasheet. It lists the recommended usage range, the pH range where it works and the maximum temperature to add it at.` },
    { q: `Can essential oils preserve my product?`, a: `No. At safe levels they do not protect against microbes. Use a proper preservative.` },
    { q: `What does Q.S. mean?`, a: `Quantum satis, "as much as needed". It marks the ingredient (usually water) that fills the formula up to 100% after everything else has been weighed.` },
    { q: `I do not have an ingredient in a recipe. What can I do?`, a: `You can often swap in something with the same job. The Studio checks your stash against any recipe and suggests substitutions, from your own shelf or to buy, and flags what to double-check.` },
    { q: `Can I sell what I make?`, a: `Usually only with documented safety assessments and correct labelling, and the rules differ by country. See [the basics of cosmetic regulation](/blog/selling-your-formulas).` },
];
