import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('./apiClient', async (importOriginal) => ({ ...(await importOriginal<typeof import('./apiClient')>()), request: mocks.request }));

import { ACTIONS, eventLabel, openMember, performAction, searchMembers, type AdminMember } from './adminClient';

beforeEach(() => { mocks.request.mockReset().mockResolvedValue([]); });

const member = (over: Partial<AdminMember> = {}): AdminMember => ({
    id: 'm1', email: 'a@b.c', username: 'sam', emailVerified: true, hasPassword: true, passwordSignInOff: false, googleLinked: false, moderator: false, twoStepOn: false,
    passkeys: 0, passkeysUsed: 0, createdAt: '2026-11-01', lastLoginAt: null, ...over,
});
const offered = (m: AdminMember) => ACTIONS.filter(a => a.needs(m)).map(a => a.id);

describe('the admin calls', () => {
    it('searches with the text encoded and trimmed', async () => {
        await searchMembers('  a+b@x.com ');
        expect(mocks.request).toHaveBeenCalledWith('/api/v1/admin/members?q=a%2Bb%40x.com');
    });

    it('opens a member by id', async () => {
        await openMember('m 1');
        expect(mocks.request).toHaveBeenCalledWith('/api/v1/admin/members/m%201');
    });

    it('sends a change as a POST with the reason and the administrator\'s password', async () => {
        await performAction('m1', { action: 'reset_two_step', reason: 'lost phone', password: 'pw' });
        expect(mocks.request).toHaveBeenCalledWith('/api/v1/admin/members/m1/actions', { method: 'POST', body: { action: 'reset_two_step', reason: 'lost phone', password: 'pw' } });
    });
});

describe('which actions are offered', () => {
    it('offers only what would change something', () => {
        expect(offered(member())).toEqual(['grant_moderator', 'sign_out_everywhere']);
        expect(offered(member({ moderator: true }))).toEqual(['revoke_moderator', 'sign_out_everywhere']);
        expect(offered(member({ twoStepOn: true, passkeys: 2, passwordSignInOff: true }))).toEqual(['grant_moderator', 'reset_two_step', 'remove_passkeys', 'restore_password_sign_in', 'sign_out_everywhere']);
    });

    it('marks the recovery steps that lower an account\'s protection as dangerous', () => {
        expect(ACTIONS.filter(a => a.danger).map(a => a.id)).toEqual(['reset_two_step', 'remove_passkeys']);
    });
});

describe('event labels', () => {
    it('uses words for known events, and a readable fallback for new ones', () => {
        expect(eventLabel('passkey_login')).toBe('Signed in with a passkey');
        expect(eventLabel('some_new_event')).toBe('some new event');
    });
});
