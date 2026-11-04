import { describe, expect, it } from 'vitest';
import { contactLink } from './contact';
import { LEGAL } from '../content/legal';

describe('the contact link', () => {
    it('opens an email to the address in the legal pages, with a subject', () => {
        const url = new URL(contactLink());
        expect(url.protocol).toBe('mailto:');
        expect(decodeURIComponent(url.pathname)).toBe(LEGAL.contactEmail);
        expect(url.searchParams.get('subject')).toBe('Formularium feedback');
    });

    it('starts a message to fill in, and says which page the person was on', () => {
        const body = new URL(contactLink('Stash (/stash)')).searchParams.get('body')!;
        expect(body).toContain('What happened, or what would you like to see?');
        expect(body).toContain('Page: Stash (/stash)');
        expect(new URL(contactLink()).searchParams.get('body')).not.toContain('Page:');
    });
});
