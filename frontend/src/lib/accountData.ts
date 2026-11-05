import { supabase } from './supabase';
import { deleteAccount } from './authClient';

/** Where to send people after their account is gone. The landing page shows a short confirmation for it. */
export const ACCOUNT_DELETED_URL = '/?account=deleted';

/** The signed-in user's data as pretty-printed JSON, plus a file name for it. */
export async function exportMyData(now: Date = new Date()): Promise<{ filename: string; json: string }> {
    const { data, error } = await supabase.rpc('export_my_data');
    if (error) throw new Error(error.message);
    return { filename: `formularium-data-${now.toISOString().slice(0, 10)}.json`, json: JSON.stringify(data, null, 2) };
}

/** Saves text as a file through the browser. */
export function downloadTextFile(filename: string, text: string, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

/** Permanently deletes the signed-in account and its data, then forgets the sign-in on this device. */
export async function deleteMyAccount(): Promise<void> {
    // The Spring backend deletes the account; the database removes what belongs to it
    await deleteAccount();
}

/** Whether what was typed matches the account's email, ignoring case and stray spaces. */
export const emailMatches = (typed: string, email: string | undefined | null) =>
    !!email && typed.trim().toLowerCase() === email.trim().toLowerCase();

/** A full page load, so nothing from the old session stays in memory. */
export function leaveAfterDeletion() {
    window.location.assign(ACCOUNT_DELETED_URL);
}
