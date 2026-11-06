/** The message of anything that was thrown, or an empty string when it carries none. */
export function errorText(err: unknown): string {
    return err instanceof Error ? err.message : '';
}
