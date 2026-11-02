import { useEffect } from 'react';

const SUFFIX = 'Formularium';

/** Sets the browser tab title while the page is mounted. */
export function usePageTitle(title: string) {
    useEffect(() => {
        const previous = document.title;
        document.title = `${title} | ${SUFFIX}`;
        return () => { document.title = previous; };
    }, [title]);
}
