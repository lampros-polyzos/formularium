import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import HeroIllustration from './HeroIllustration';

afterEach(cleanup);

describe('HeroIllustration', () => {
    it('is exposed to assistive tech as a described image', () => {
        render(<HeroIllustration />);
        expect(screen.getByRole('img', { name: /home formulation lab/i })).toBeInTheDocument();
    });

    it('has unique ids and every reference resolves', () => {
        const { container } = render(<HeroIllustration />);
        const ids = [...container.querySelectorAll('[id]')].map(e => e.id);
        expect(new Set(ids).size).toBe(ids.length);

        const refs = [...container.innerHTML.matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)].map(m => m[1] ?? m[2]);
        expect(refs.length).toBeGreaterThan(0);
        for (const ref of refs) expect(ids, ref).toContain(ref);
    });
});
