// Changing the password of the signed-in member. (Setting a NEW password from an email link is `resetPassword` in authClient.ts.)

import { request } from './apiClient';

/**
 * Needs the current password. The backend signs every OTHER device out, keeps this one signed in, and emails the account a notice.
 * Throws an ApiError whose message is safe to show: a wrong current password, a new one that is too short, too long, the same as the old one or known from a data
 * breach, or "too many attempts". An account that only uses Google answers `no_password`.
 */
export async function changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
    await request<void>('/api/v1/auth/password', { method: 'POST', body: input });
}
