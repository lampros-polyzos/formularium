import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PostDetail from './PostDetail';
import ShareFormulaModal from '../components/ShareFormulaModal';

const mocks = vi.hoisted(() => ({
    posted: [] as Record<string, unknown>[],
    versions: [] as { postId: string; data: unknown; notes: string | null }[],
    /** The copies made of a recipe, as the backend was asked to make them. */
    created: [] as { body: Record<string, unknown>; options?: { copy?: boolean } }[],
    linked: [] as { formulaId: string; postId: string }[],
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

// Formulas are made and linked by the backend
vi.mock('../lib/formulasApi', () => ({
    createFormula: (body: Record<string, unknown>, options?: { copy?: boolean }) => { mocks.created.push({ body, options }); return Promise.resolve({ id: 'new-formula' }); },
    linkFormulaToPost: (formulaId: string, postId: string) => { mocks.linked.push({ formulaId, postId }); return Promise.resolve(); },
}));

vi.mock('../lib/communityApi', () => ({
    fetchPost: (id: string) => (mocks.posts[id] ? Promise.resolve(mocks.posts[id]) : Promise.reject(new Error('That post no longer exists.'))),
    fetchRemixes: () => Promise.resolve(mocks.remixes),
    fetchVersions: () => Promise.resolve([{ version: 1, release_notes: '', created_at: '2026-11-01', formulation_data: [{ id: 'ing1', name: 'Water', inci_name: 'Aqua', phase: 'A', percentage: 100 }] }]),
    fetchComments: () => Promise.resolve([]),
    listMutes: () => Promise.resolve([]),
    muteMember: vi.fn(),
    unmuteMember: vi.fn(),
    isModerator: () => Promise.resolve(false),
    reportContent: vi.fn(),
    createPost: (post: Record<string, unknown>) => { mocks.posted.push(post); return Promise.resolve({ id: 'new-post' }); },
    editPost: vi.fn(),
    addVersion: (postId: string, data: unknown, notes: string | null) => { mocks.versions.push({ postId, data, notes }); return Promise.resolve({}); },
}));

const settle = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });

beforeEach(() => {
    mocks.posted = [];
    mocks.versions = [];
    mocks.created = [];
    mocks.linked = [];
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

        expect(mocks.created).toHaveLength(1);
        const { body, options } = mocks.created[0];
        expect(body).toMatchObject({ name: 'Lighter Day Cream (Clone)', remixed_from_post_id: 'p1' });
        expect(body.ingredients).toEqual([{ ingredient_id: 'ing1', phase_letter: 'A', percentage: 100, is_qs: false }]); // the recipe itself was copied
        expect(options).toEqual({ copy: true });   // another member's private ingredient is left out rather than failing the copy
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
        expect(mocks.posted[0]).toMatchObject({ title: 'My Cream', remixed_from_post_id: 'p0' });
        expect(mocks.posted[0]).not.toHaveProperty('author_id'); // the backend knows who is sharing
    });

    it('adds no remix field to an ordinary recipe', async () => {
        renderModal(null);
        await submit();
        expect(mocks.posted[0].remixed_from_post_id ?? null).toBeNull();
    });

    it('records the first version of the recipe on the new post, and links the formula to it', async () => {
        renderModal('p0');
        await submit();
        expect(mocks.versions).toHaveLength(1);
        expect(mocks.versions[0].postId).toBe('new-post');
        expect(mocks.linked).toEqual([{ formulaId: 'f1', postId: 'new-post' }]);
    });
});
