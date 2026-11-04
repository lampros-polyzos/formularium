import { describe, expect, it } from 'vitest';
import { LEGACY_POST_TYPES, POST_TYPES, postTypeInfo, storedTypesFor } from './postTypes';

describe('the kinds of community post', () => {
    it('are discussion, advice, information and recipe', () => {
        expect(POST_TYPES.map(t => t.id)).toEqual(['discussion', 'advice', 'information', 'formulation']);
        expect(POST_TYPES.map(t => t.label)).toEqual(['Discussion', 'Advice', 'Information', 'Recipe']);
    });

    it('say what each is for', () => {
        const hint = (id: string) => POST_TYPES.find(t => t.id === id)!.hint;
        expect(hint('advice')).toBe('Ask for advice');
        expect(hint('information')).toBe('Share useful information');
    });

    it('no longer include a request or an education kind', () => {
        const ids: string[] = POST_TYPES.map(t => t.id);
        expect(ids).not.toContain('request');
        expect(ids).not.toContain('education');
        expect(POST_TYPES.map(t => t.label)).not.toEqual(expect.arrayContaining(['Request', 'Education']));
    });

    it('have a distinct colour and icon each', () => {
        expect(new Set(POST_TYPES.map(t => t.color)).size).toBe(POST_TYPES.length);
        expect(new Set(POST_TYPES.map(t => t.icon)).size).toBe(POST_TYPES.length);
    });
});

describe('showing a stored post type', () => {
    it('uses the new names', () => {
        expect(postTypeInfo('advice').label).toBe('Advice');
        expect(postTypeInfo('information').label).toBe('Information');
        expect(postTypeInfo('formulation').label).toBe('Recipe');
    });

    it('understands the old names, until every post has been renamed', () => {
        expect(postTypeInfo('request')).toEqual(postTypeInfo('advice'));
        expect(postTypeInfo('education')).toEqual(postTypeInfo('information'));
        expect(LEGACY_POST_TYPES).toEqual({ request: 'advice', education: 'information' });
    });

    it('shows anything unknown as a plain post', () => {
        for (const odd of ['poll', '', null, undefined]) expect(postTypeInfo(odd).label, String(odd)).toBe('Post');
    });
});

describe('finding every post of a kind', () => {
    it('includes the old name a post may still have', () => {
        expect(storedTypesFor('advice')).toEqual(['advice', 'request']);
        expect(storedTypesFor('information')).toEqual(['information', 'education']);
    });

    it('is just the name for kinds that were never renamed', () => {
        expect(storedTypesFor('discussion')).toEqual(['discussion']);
        expect(storedTypesFor('formulation')).toEqual(['formulation']);
    });
});
