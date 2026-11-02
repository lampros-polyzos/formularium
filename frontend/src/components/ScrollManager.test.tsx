import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ScrollManager from './ScrollManager';

function Page({ name }: { name: string }) {
    const navigate = useNavigate();
    return (
        <div>
            <h1>{name}</h1>
            <Link to="/b">go b</Link>
            <Link to="/a">go a</Link>
            <button onClick={() => navigate('/a?q=x', { replace: true })}>rewrite url</button>
            <button onClick={() => navigate(-1)}>back</button>
            <h2 id="section">Section</h2>
            <Link to="/a#section">go section</Link>
        </div>
    );
}

function setup() {
    return render(
        <MemoryRouter initialEntries={['/a']}>
            <ScrollManager />
            <Routes>
                <Route path="/a" element={<Page name="A" />} />
                <Route path="/b" element={<Page name="B" />} />
            </Routes>
        </MemoryRouter>
    );
}

let scrollTo: ReturnType<typeof vi.fn>;

beforeEach(() => {
    scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe('ScrollManager', () => {
    it('scrolls to the top when a link opens a new page', () => {
        setup();
        scrollTo.mockClear();
        fireEvent.click(screen.getByText('go b'));
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('B');
        expect(scrollTo).toHaveBeenCalledWith(0, 0);
    });

    it('does not jump when the URL is rewritten in place on the same page', () => {
        setup();
        scrollTo.mockClear();
        fireEvent.click(screen.getByText('rewrite url'));
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it('scrolls to the section named in the hash instead of the top', () => {
        setup();
        fireEvent.click(screen.getByText('go b'));
        scrollTo.mockClear();
        fireEvent.click(screen.getAllByText('go section')[0]);
        expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it('restores the earlier position on Back', () => {
        setup();
        Object.defineProperty(window, 'scrollY', { value: 640, configurable: true });
        fireEvent.scroll(window);
        fireEvent.click(screen.getByText('go b'));
        Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
        scrollTo.mockClear();
        fireEvent.click(screen.getByText('back'));
        expect(scrollTo).toHaveBeenLastCalledWith(0, 640);
    });
});
