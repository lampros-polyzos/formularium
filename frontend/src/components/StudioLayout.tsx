import type { ReactNode } from 'react';
import Header from './Header';
import StudioSidebar, { type StudioSection } from './StudioSidebar';

interface StudioLayoutProps {
    active: StudioSection;
    /** Shown in the top bar. */
    title: string;
    children: ReactNode;
    /** Lock the page to the window height, for pages that scroll their own list instead of the whole page. */
    fixedHeight?: boolean;
}

/**
 * The frame around every page in the Studio: the shared sidebar on the left, and a top bar with "Back to Studio"
 * at its left (the Studio home itself has nothing to go back to).
 */
export default function StudioLayout({ active, title, children, fixedHeight = false }: StudioLayoutProps) {
    return (
        <div className="min-h-screen bg-[#f7f8f6] flex">
            <StudioSidebar active={active} />
            <div className={`flex-1 flex flex-col min-w-0 ${fixedHeight ? 'h-screen overflow-hidden' : ''}`}>
                {active === 'formulations'
                    ? <Header title={title} />
                    : <Header title={title} backPath="/studio" backLabel="Back to Studio" />}
                {children}
            </div>
        </div>
    );
}
