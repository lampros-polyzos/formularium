import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PostDetail from './PostDetail';
import ShareFormulaModal from '../components/ShareFormulaModal';

const mocks = vi.hoisted(() => ({
    inserts: [] as { table: string; row: Record<string, unknown> }[],
    /** Pretend the database has not been migrated: inserts with lineage columns are refused. */
    unmigrated: false,
    posts: {} as Record<string, Record<string, unknown>>,
    remixes: [] as Record<string, unknown>[],
}));

vi.mock('../components/Header', () => ({ default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../components/RecipeRatings', () => ({ default: () => null }));
vi.mock('../contexts/AuthContext', () => {
    const value = { user: { id: 'me' }, session: {}, username: 'Me', isLoading: false };
    return { useAuth: () => value };
});
vi.mock('../contexts/SettingsContext', () => ({ useSettings: () => ({ formatDate: (d: string) => d }) }));

vi.mock('../lib/supabase', () => {
    const builder = (table: string) => {
        const filters: Record<string, unknown> = {};
        const state = { single: false, inserted: null as Record<string, unknown> | null };
        const b: Record<string, unknown> = {};
        const result = (): { data: unknown; error: unknown } => {
            if (state.inserted) {
                const refused = mocks.unmigrated && ('remixed_from_post_id' in state.inserted || 'cloned_from_formulation_id' in state.inserted);
                if (refused) return { data: null, error: { code: '42703', message: 'column does not exist' } };
                mocks.inserts.push({ table, row: state.inserted });
                if (table === 'formulation_phases') return { data: [{ id: 'ph-a', phase_letter: 'A' }], error: null };
                return { data: state.single ? { id: `new-${table}` } : null, error: null };
            }
            if (table === 'community_posts') {
                if (filters.remixed_from_post_id) return { data: mocks.remixes, error: null };
                return { data: mocks.posts[filters.id as string] ?? null, error: null };
            }
            if (table === 'post_snapshots') {
                return { data: [{ version: 1, release_notes: '', created_at: '2026-11-01', formulation_data: [{ id: 'ing1', name: 'Water', inci_name: 'Aqua', phase: 'A', percentage: 100 }] }], error: null };
            }
            return { data: [], error: null };
        };
        b.select = () => b;
        b.eq = (col: string, val: unknown) => { filters[col] = val; return b; };
        b.order = () => b;
        b.limit = () => b;
        b.insert = (rows: Record<string, unknown>[]) => { state.inserted = rows[0]; return b; };
        b.update = () => b;
        b.single = () => { state.single = true; return Promise.resolve(result()); };
        b.maybeSingle = () => Promise.resolve(result());
        b.then = (resolve: (v: unknown) => void) => resolve(result());
        return b;
    };
    return { supabase: { from: builder, channel: vi.fn(), removeChannel: vi.fn(), auth: { signOut: vi.fn() } } };
});

const settle = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const insertsInto = (table: string) => mocks.inserts.filter(i => i.table === table).map(i => i.row);

beforeEach(() => {
    mocks.inserts = [];
    mocks.unmigrated = false;
    mocks.remixes = [];
    mocks.posts = {
        p1: { id: 'p1', title: 'Lighter Day Cream', post_type: 'formulation', author_id: 'sam', author_name: 'Sam', remixed_from_post_id: 'p0', write_up: 'A remix', created_at: '2026-11-02' },
        p0: { id: 'p0', title: 'Original Day Cream', author_name: 'Kim' },
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('alert', vi.fn());
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function openPost(id = 'p1') {
    render(
        <MemoryRouter initialEntries={[`/community/${id}`]}>
            <Routes>
                <Route path="/community/:id" element={<PostDetail />} />
                <Route path="/studio/:id" element={<div>STUDIO</div>} />
            </Routes>
        </MemoryRouter>
    );
    await settle();
}

describe('a community recipe page', () => {
    it('says what the recipe was remixed from, with a link to it', async () => {
        await openPost();
        const link = screen.getByRole('link', { name: 'Original Day Cream' });
        expect(link).toHaveAttribute('href', '/community/p0');
        expect(screen.getByText(/Remixed from/)).toHaveTextContent('by Kim');
    });

    it('says nothing for a recipe that is not a remix', async () => {
        mocks.posts.p1.remixed_from_post_id = null;
        await openPost();
        expect(screen.queryByText(/Remixed from/)).not.toBeInTheDocument();
    });

    it('lists the remixes other people made', async () => {
        mocks.remixes = [{ id: 'r1', title: 'Vegan Day Cream', author_name: 'Alex' }];
        await openPost();
        expect(screen.getByRole('heading', { name: /Remixes \(1\)/ })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Vegan Day Cream' })).toHaveAttribute('href', '/community/r1');
    });

    it('"Clone to Studio" makes a copy that remembers which recipe it came from', async () => {
        await openPost();
        fireEvent.click(screen.getByRole('button', { name: /Clone to Studio/ }));
        await settle();

        const [draft] = insertsInto('formulations');
        expect(draft).toMatchObject({ name: 'Lighter Day Cream (Clone)', user_id: 'me', status: 'Draft', remixed_from_post_id: 'p1' });
        expect(insertsInto('formulation_ingredients')).toHaveLength(1); // the recipe itself was copied
        expect(screen.getByText('STUDIO')).toBeInTheDocument();
    });

    it('still makes the copy, without the link, if the database has not been migrated yet', async () => {
        mocks.unmigrated = true;
        await openPost();
        fireEvent.click(screen.getByRole('button', { name: /Clone to Studio/ }));
        await settle();

        const [draft] = insertsInto('formulations');
        expect(draft).toMatchObject({ name: 'Lighter Day Cream (Clone)' });
        expect(draft).not.toHaveProperty('remixed_from_post_id');
        expect(screen.getByText('STUDIO')).toBeInTheDocument();
    });
});

describe('sharing a formula', () => {
    const renderModal = (remixedFromPostId: string | null) => render(
        <ShareFormulaModal
            isOpen onClose={vi.fn()} currentProjectName="My Cream" recipeData={[{ id: 'ing1', trade_name: 'Water', inci_name: 'Aqua', phase: 'A', percentage: 100 }]}
            activeProfileName="O/W Lotion" formulaId="f1" communityPostId={null} remixedFromPostId={remixedFromPostId} onShareSuccess={vi.fn()}
        />
    );
    const submit = async () => {
        fireEvent.change(screen.getByPlaceholderText(/Describe the overall/), { target: { value: 'My take' } });
        fireEvent.submit(document.getElementById('share-formula-form')!);
        await settle();
    };

    it('records that a recipe started as someone else\'s', async () => {
        renderModal('p0');
        await submit();
        expect(insertsInto('community_posts')[0]).toMatchObject({ title: 'My Cream', author_id: 'me', remixed_from_post_id: 'p0' });
    });

    it('adds no remix field to an ordinary recipe', async () => {
        renderModal(null);
        await submit();
        expect(insertsInto('community_posts')[0]).not.toHaveProperty('remixed_from_post_id');
    });

    it('still shares, without the link, if the database has not been migrated yet', async () => {
        mocks.unmigrated = true;
        renderModal('p0');
        await submit();
        const [post] = insertsInto('community_posts');
        expect(post).toMatchObject({ title: 'My Cream' });
        expect(post).not.toHaveProperty('remixed_from_post_id');
        expect(insertsInto('post_snapshots')).toHaveLength(1);
    });
});
