// The admin tool's calls. Who may use them is decided by the backend on every request; the page only hides what it knows will be refused.

import { request } from './apiClient';

export interface AdminStatus { admin: boolean; secondFactor: boolean }

/** A member's account as an administrator sees it: state only, never a secret. */
export interface AdminMember {
    id: string;
    email: string;
    username: string;
    emailVerified: boolean;
    hasPassword: boolean;
    passwordSignInOff: boolean;
    googleLinked: boolean;
    moderator: boolean;
    twoStepOn: boolean;
    passkeys: number;
    passkeysUsed: number;
    createdAt: string;
    lastLoginAt: string | null;
}

export interface AdminDetail {
    member: AdminMember;
    events: { type: string; at: string }[];
    devices: { description: string; firstSeenAt: string; lastSeenAt: string }[];
    history: { adminEmail: string; action: AdminAction; reason: string; at: string }[];
}

export type AdminAction = 'grant_moderator' | 'revoke_moderator' | 'reset_two_step' | 'remove_passkeys' | 'restore_password_sign_in' | 'sign_out_everywhere';

export const MIN_SEARCH = 3;

export const adminStatus = () => request<AdminStatus>('/api/v1/admin/status');

export const searchMembers = (query: string) => request<AdminMember[]>(`/api/v1/admin/members?q=${encodeURIComponent(query.trim())}`);

/** Opening a member is recorded in the audit log by the backend. */
export const openMember = (id: string) => request<AdminDetail>(`/api/v1/admin/members/${encodeURIComponent(id)}`);

/** Needs the administrator's own password and a reason. Returns the member as it is afterwards. */
export const performAction = (id: string, input: { action: AdminAction; reason: string; password: string }) =>
    request<AdminDetail>(`/api/v1/admin/members/${encodeURIComponent(id)}/actions`, { method: 'POST', body: input });

/** What each change does, in the words of the page. `needs` says when the button is useful, so a stale click is not offered. */
export const ACTIONS: { id: AdminAction; label: string; help: string; danger?: boolean; needs: (m: AdminMember) => boolean }[] = [
    { id: 'grant_moderator', label: 'Make moderator', help: 'Lets them review reports and remove community posts.', needs: m => !m.moderator },
    { id: 'revoke_moderator', label: 'Remove moderator', help: 'Takes their moderator rights away.', needs: m => m.moderator },
    { id: 'reset_two_step', label: 'Switch off two-step verification', help: 'For a member who lost their phone and recovery codes. They can switch it on again.', danger: true, needs: m => m.twoStepOn },
    { id: 'remove_passkeys', label: 'Remove all passkeys', help: 'Also switches password sign-in back on, so they are not locked out.', danger: true, needs: m => m.passkeys > 0 },
    { id: 'restore_password_sign_in', label: 'Switch password sign-in back on', help: 'For a member who turned it off and lost their passkey.', needs: m => m.passwordSignInOff },
    { id: 'sign_out_everywhere', label: 'Sign out every device', help: 'Ends every session of this account. They sign in again.', needs: () => true },
];

const EVENT_LABELS: Record<string, string> = {
    login_success: 'Signed in', login_failed: 'Wrong password', google_login: 'Signed in with Google', passkey_login: 'Signed in with a passkey', mfa_login_success: 'Signed in with a code',
    register: 'Account created', email_verified: 'Email confirmed', password_changed: 'Password changed', password_reset_requested: 'Reset link requested', password_reset_done: 'Password reset',
    mfa_enabled: 'Two-step verification on', mfa_disabled: 'Two-step verification off', recovery_code_used: 'Recovery code used', passkey_added: 'Passkey added', passkey_removed: 'Passkey removed',
    password_login_disabled: 'Password sign-in switched off', password_login_enabled: 'Password sign-in switched on', new_device_sign_in: 'Sign-in from a new browser', admin_action: 'Changed by an administrator',
    refresh_reuse: 'Session ended as possibly stolen',
};

export const eventLabel = (type: string) => EVENT_LABELS[type] ?? type.replace(/_/g, ' ');
