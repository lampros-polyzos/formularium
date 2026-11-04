import { LEGAL } from '../content/legal';

/**
 * A "mailto:" link for suggestions, insights or problems. The message starts with a short template, and says which page
 * the person was on so a problem is easier to find. Nothing is sent anywhere until they send the email themselves.
 */
export function contactLink(page?: string): string {
    const lines = [
        'Hi,',
        '',
        'What happened, or what would you like to see?',
        '',
        '',
        'What did you expect instead? (for a problem)',
        '',
        '',
        '---',
        ...(page ? [`Page: ${page}`] : []),
    ];
    const subject = encodeURIComponent('Formularium feedback');
    const body = encodeURIComponent(lines.join('\n'));
    return `mailto:${LEGAL.contactEmail}?subject=${subject}&body=${body}`;
}
