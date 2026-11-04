// Size limits for what people write in the community. They match the database rules (community safety migration), which
// are what actually enforce them; these let the screens stop people before they hit them.

export const TITLE_MAX = 150;
export const TEXT_MAX = 10000;
export const COMMENT_MAX = 2000;
export const SOURCES_MAX = 2000;
export const REPORT_DETAILS_MAX = 1000;

const num = (n: number) => n.toLocaleString('en-US');

/** The database's own wording for a refused post, comment or report, made readable. Anything else is returned as it came. */
export function communityErrorMessage(err: unknown): string {
    const message = (err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err ?? '')) || 'Something went wrong.';
    if (/posting too quickly|commenting too quickly|lot of reports|cannot report your own|no longer exists/i.test(message)) return message;
    if (/community_posts_title_length/.test(message)) return `Titles can be up to ${TITLE_MAX} characters.`;
    if (/community_posts_write_up_length/.test(message)) return `Text can be up to ${num(TEXT_MAX)} characters.`;
    if (/community_posts_sources_length/.test(message)) return `Sources can be up to ${num(SOURCES_MAX)} characters.`;
    if (/post_comments_body_length/.test(message)) return `Comments can be up to ${num(COMMENT_MAX)} characters.`;
    if (/duplicate key/i.test(message) && /content_reports/.test(message)) return 'You have already reported this.';
    if (/row-level security|permission denied/i.test(message)) return 'You are not allowed to do that.';
    return message;
}

export const REPORT_REASONS: { id: string; label: string }[] = [
    { id: 'dangerous', label: 'Unsafe or dangerous advice' },
    { id: 'medical', label: 'Medical claims or treatment advice' },
    { id: 'spam', label: 'Spam or advertising' },
    { id: 'harassment', label: 'Harassment or abuse' },
    { id: 'copied', label: 'Copied from someone else' },
    { id: 'personal', label: 'Shares personal information' },
    { id: 'other', label: 'Something else' },
];

export const SAFETY_NOTICE = 'Shared by members, not professional advice. Patch test anything new, and keep water-based products properly preserved.';
