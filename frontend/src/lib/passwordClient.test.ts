import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('./apiClient', async (importOriginal) => ({ ...(await importOriginal<typeof import('./apiClient')>()), request: mocks.request }));

import { ApiError } from './apiClient';
import { changePassword } from './passwordClient';

beforeEach(() => { mocks.request.mockReset(); });

describe('changing the password', () => {
    it('posts the current and the new password to the signed-in API', async () => {
        mocks.request.mockResolvedValue(undefined);
        await changePassword({ currentPassword: 'the old one', newPassword: 'a brand new password' });
        expect(mocks.request).toHaveBeenCalledWith('/api/v1/auth/password', { method: 'POST', body: { currentPassword: 'the old one', newPassword: 'a brand new password' } });
    });

    it('passes on the server\'s own reason when it refuses', async () => {
        mocks.request.mockRejectedValue(new ApiError(401, 'invalid_credentials', 'Your current password is not right.'));
        await expect(changePassword({ currentPassword: 'x', newPassword: 'a brand new password' })).rejects.toMatchObject({ status: 401, code: 'invalid_credentials', message: 'Your current password is not right.' });
    });
});
