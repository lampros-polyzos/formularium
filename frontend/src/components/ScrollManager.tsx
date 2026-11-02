import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Where the user was on each history entry, so Back returns to the same spot
const positions = new Map<string, number>();

/**
 * React Router keeps the scroll position between pages, so a link clicked at the bottom of one page
 * opens the next one at the bottom too. This puts navigation back to normal browser behaviour.
 * Mount once, inside the router.
 */
export default function ScrollManager() {
    const location = useLocation();
    const navigationType = useNavigationType();
    const previousPath = useRef(location.pathname);

    useEffect(() => {
        const remember = () => positions.set(location.key, window.scrollY);
        window.addEventListener('scroll', remember, { passive: true });
        return () => window.removeEventListener('scroll', remember);
    }, [location.key]);

    useLayoutEffect(() => {
        const samePage = previousPath.current === location.pathname;
        previousPath.current = location.pathname;

        if (location.hash) {
            const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
            if (target) {
                target.scrollIntoView();
                return;
            }
        }
        if (navigationType === 'POP') {
            window.scrollTo(0, positions.get(location.key) ?? 0);
            return;
        }
        // Typing in a page's search box rewrites the URL in place: don't jump
        if (navigationType === 'REPLACE' && samePage) return;

        window.scrollTo(0, 0);
    }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps -- run once per navigation
    return null;
}
