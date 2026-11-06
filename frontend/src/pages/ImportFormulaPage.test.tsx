import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImportFormulaPage from './ImportFormulaPage';
import { takeImport } from '../lib/importHandoff';
import { LIBRARY, row } from '../lib/starterLibraryFixture';

const mocks = vi.hoisted(() => ({ load: vi.fn(), stash: new Set<string>() }));

vi.mock('../lib/importCandidates', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/importCandidates')>()), loadImportCandidates: mocks.load }));
vi.mock('../components/Header', () => ({ default: ({ title }: { title: string }) => <h2>{title}</h2> }));
vi.mock('../components/content/usePageTitle', () => ({ usePageTitle: () => undefined }));
const AUTH = vi.hoisted(() => ({ user: { id: 'u1' }, username: 'Sam' }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => AUTH }));
// The product type comes from the backend
vi.mock('../lib/formulasApi', () => ({
    fetchProfile: () => Promise.resolve({ id: 'ow_lotion', name: 'O/W Lotion', max_oil_phase_percent: 30, default_ph_min: 5, default_ph_max: 6 }),
}));

const renderPage = () => render(
    <MemoryRouter initialEntries={['/studio/import']}>
        <Routes>
            <Route path="/studio/import" element={<ImportFormulaPage />} />
            <Route path="/studio/new" element={<p>THE EDITOR</p>} />
        </Routes>
    </MemoryRouter>
);
const paste = (text: string) => fireEvent.change(screen.getByLabelText('Your formula'), { target: { value: text } });
const analyse = async (text: string) => {
    renderPage();
    paste(text);
    fireEvent.click(screen.getByRole('button', { name: 'Find ingredients' }));
    await screen.findByRole('region', { name: 'Check the ingredients' });
};
const ingredient = (name: string) => screen.getByLabelText(`Ingredient for ${name}`) as HTMLSelectElement;
const amount = (name: string) => screen.getByLabelText(`Amount for ${name}`) as HTMLInputElement;

beforeEach(() => {
    sessionStorage.clear();
    mocks.load.mockReset().mockResolvedValue({ rows: LIBRARY, stashIds: new Set() });
});
afterEach(cleanup);

describe('pasting a formula', () => {
    it('will not look anything up with nothing pasted', () => {
        renderPage();
        expect(screen.getByRole('button', { name: 'Find ingredients' })).toBeDisabled();
    });

    it('can fill in an example', () => {
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'Try an example' }));
        expect((screen.getByLabelText('Your formula') as HTMLTextAreaElement).value).toContain('Olivem 1000');
    });

    it('says so when it finds no ingredients', async () => {
        renderPage();
        paste('???');
        fireEvent.click(screen.getByRole('button', { name: 'Find ingredients' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('could not find any ingredients');
        expect(mocks.load).not.toHaveBeenCalled();
    });

    it('says so when the library could not be reached, and keeps the text', async () => {
        mocks.load.mockRejectedValue(new Error('offline'));
        renderPage();
        paste('Water 70%');
        fireEvent.click(screen.getByRole('button', { name: 'Find ingredients' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('could not look up your ingredient library');
        expect(screen.getByLabelText('Your formula')).toHaveValue('Water 70%');
    });
});

describe('checking the matches', () => {
    it('matches each line to the library and fills in the table with the amounts pasted', async () => {
        await analyse('Water 70%\nGlycerine 5%\nVitamin E 1%\nJojoba oil 24%');
        expect(screen.getByRole('status', { name: 'Match summary' })).toHaveTextContent('Matched 4 of 4 lines');
        expect(ingredient('Water').selectedOptions[0].textContent).toContain('Aqua');
        expect(ingredient('Glycerine').selectedOptions[0].textContent).toContain('Glycerin');
        expect(ingredient('Vitamin E').selectedOptions[0].textContent).toContain('Tocopherol');
        expect(amount('Water').value).toBe('70');
        expect(amount('Glycerine').value).toBe('5');
        expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('fills the rest for "q.s." and shows it as such', async () => {
        await analyse('Glycerin 5%\nWater q.s. to 100');
        expect(amount('Water').value).toBe('95');
        expect(screen.getByText('the rest')).toBeInTheDocument();
    });

    it('leaves a line out, and says so, when nothing in the library fits', async () => {
        await analyse('Water 90%\nUnobtainium powder 10%');
        expect(ingredient('Unobtainium powder').value).toBe('');
        expect(within(ingredient('Unobtainium powder')).getByText('— Not found in your library —')).toBeInTheDocument();
        expect(screen.queryByLabelText('Amount for Unobtainium powder')).not.toBeInTheDocument();
        expect(screen.getByText(/Skipped with an amount: Unobtainium powder/)).toBeInTheDocument();
    });

    it('lets you change the match, the amount and the phase, and updates the total', async () => {
        await analyse('Water 70%\nShea Butter 30%');
        const shea = ingredient('Shea Butter');
        const raw = Array.from(shea.options).find(o => o.textContent?.includes('Shea Butter (Raw)'))!;
        fireEvent.change(shea, { target: { value: raw.value } });
        expect(ingredient('Shea Butter').selectedOptions[0].textContent).toContain('Raw');

        fireEvent.change(amount('Shea Butter'), { target: { value: '20' } });
        expect(screen.getByText('90%')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Phase for Shea Butter'), { target: { value: 'C' } });
        expect((screen.getByLabelText('Phase for Shea Butter') as HTMLSelectElement).value).toBe('C');
    });

    it('leaves a line out when you choose to', async () => {
        await analyse('Water 70%\nGlycerin 5%');
        fireEvent.change(ingredient('Glycerin'), { target: { value: '' } });
        expect(screen.getByRole('status', { name: 'Match summary' })).toHaveTextContent('Matched 1 of 2 lines');
        expect(screen.queryByLabelText('Amount for Glycerin')).not.toBeInTheDocument();
    });

    it('suggests amounts when none were given, and says so', async () => {
        await analyse('Aqua, Glycerin, Cetearyl Alcohol (and) Cetearyl Glucoside, Simmondsia Chinensis Seed Oil, Phenoxyethanol (and) Ethylhexylglycerin');
        expect(screen.getByText(/No amounts were given/)).toBeInTheDocument();
        expect(Number(amount('Glycerin').value)).toBeGreaterThan(0);
        expect(screen.getAllByText('suggested').length).toBeGreaterThan(0);
    });

    it('can go back to edit the text', async () => {
        await analyse('Water 70%');
        fireEvent.click(screen.getByRole('button', { name: 'Edit the pasted text' }));
        expect(screen.getByLabelText('Your formula')).toHaveValue('Water 70%');
    });
});

describe('creating the formula', () => {
    it('hands the matched ingredients to the Studio with their phases and amounts', async () => {
        await analyse('Phase A\nWater q.s.\nGlycerin 5%\nPhase B\nJojoba Oil 10%\nPhase C\nVitamin E 1%');
        fireEvent.change(screen.getByLabelText('Formula name'), { target: { value: 'My lotion' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create formula in Studio' }));
        expect(await screen.findByText('THE EDITOR')).toBeInTheDocument();

        const draft = takeImport()!;
        expect(draft.name).toBe('My lotion');
        expect(draft.profile).toMatchObject({ id: 'ow_lotion' });
        expect(draft.ingredients.map(i => [i.inci_name, i.phase, i.percentage])).toEqual([
            ['Aqua', 'A', 84], ['Glycerin', 'A', 5], ['Simmondsia Chinensis Seed Oil', 'B', 10], ['Tocopherol', 'C', 1],
        ]);
        expect(draft.ingredients[0].isQS).toBe(true);
        expect(takeImport()).toBeNull();   // only ever used once
    });

    it('tells the Studio what was left out', async () => {
        await analyse('Water 90%\nMystery goo 10%');
        fireEvent.click(screen.getByRole('button', { name: 'Create formula in Studio' }));
        await screen.findByText('THE EDITOR');
        const draft = takeImport()!;
        expect(draft.skipped).toEqual(['Mystery goo']);
        expect(draft.warnings.join(' ')).toMatch(/Skipped with an amount/);
    });

    it('will not create an empty formula', async () => {
        await analyse('Mystery goo 10%');
        expect(screen.getByRole('button', { name: 'Create formula in Studio' })).toBeDisabled();
    });

    it('uses the product type you choose', async () => {
        await analyse('Water 90%\nGlycerin 10%');
        fireEvent.change(screen.getByLabelText('Product type'), { target: { value: 'shampoo' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create formula in Studio' }));
        await screen.findByText('THE EDITOR');
        expect(takeImport()!.profileId).toBe('shampoo');
    });

    it('prefers an ingredient you own when grades are equal', async () => {
        const raw = LIBRARY.find(r => r.trade_name === 'Shea Butter (Raw)')!;
        mocks.load.mockResolvedValue({ rows: LIBRARY, stashIds: new Set([raw.id]) });
        await analyse('Shea Butter 100%');
        expect(ingredient('Shea Butter').selectedOptions[0].textContent).toContain('Raw');
        await waitFor(() => expect(amount('Shea Butter').value).toBe('100'));
    });
});

describe('general lines from a copied recipe', () => {
    const oils = [
        row('Lavandula Angustifolia Oil', 'Lavender Essential Oil', 'Fragrance / Active', 0.1, 1, 'oil'),
        row('Citrus Limon Peel Oil', 'Lemon Essential Oil', 'Fragrance / Active', 0.1, 1, 'oil'),
        row('Sodium Cocoyl Glutamate', 'SCG', 'Surfactant (Anionic)', 5, 25, 'water'),
    ];
    const withOils = () => mocks.load.mockResolvedValue({ rows: [...LIBRARY, ...oils], stashIds: new Set() });

    it('offers essential oils and fragrances for a fragrance line, without choosing one', async () => {
        withOils();
        await analyse('Water 90%\nFragrance / Essential Oils (Optional): 0.2% – 1%');
        const select = ingredient('Fragrance / Essential Oils');
        expect(select.value).toBe('');
        const group = select.querySelector('optgroup')!;
        expect(group.label).toBe('Suggestions: fragrance or essential oil');
        expect(Array.from(group.querySelectorAll('option')).map(o => o.textContent)).toEqual(expect.arrayContaining(['Lavender Essential Oil (Lavandula Angustifolia Oil)', 'Lemon Essential Oil (Citrus Limon Peel Oil)']));
        expect(screen.getByText('Optional')).toBeInTheDocument();
    });

    it('uses the middle of the pasted range once an oil is picked, and shows the range', async () => {
        withOils();
        await analyse('Water 90%\nFragrance / Essential Oils (Optional): 0.2% – 1%');
        const lavender = Array.from(ingredient('Fragrance / Essential Oils').options).find(o => o.textContent?.startsWith('Lavender'))!;
        fireEvent.change(ingredient('Fragrance / Essential Oils'), { target: { value: lavender.value } });
        expect(amount('Fragrance / Essential Oils').value).toBe('0.6');
        expect(screen.getByText('pasted 0.2–1%')).toBeInTheDocument();
        expect(screen.getByText('middle of range')).toBeInTheDocument();
    });

    it('chooses the first example that is in the library, and says which examples were given', async () => {
        withOils();
        await analyse('Water 80%\nPrimary Surfactant (Anionic - e.g., Sodium Cocoyl Glutamate or Sodium Coco Sulfate): 15% – 30%');
        expect(ingredient('Primary Surfactant').selectedOptions[0].textContent).toContain('Sodium Cocoyl Glutamate');
        expect(screen.getByText('Examples given: Sodium Cocoyl Glutamate, Sodium Coco Sulfate')).toBeInTheDocument();
        expect(amount('Primary Surfactant').value).toBe('22.5');
    });
});
