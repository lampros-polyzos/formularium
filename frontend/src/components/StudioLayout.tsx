import { useEffect, useState, type ReactNode } from 'react';
import { Menu } from 'lucide-react';
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
 * at its left (the Studio home itself has nothing to go back to). On small screens the sidebar is tucked away and
 * opened from a menu button at the very left of the top bar.
 */
export default function StudioLayout({ active, title, children, fixedHeight = false }: StudioLayoutProps) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // Escape closes the menu, as it does for any panel that covers the page
    useEffect(() => {
        if (!isMenuOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsMenuOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isMenuOpen]);

    const menuButton = (
        <button
            type="button"
            onClick={() => setIsMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={isMenuOpen}
            aria-controls="studio-sidebar"
            data-tour="studio-menu"
            className="lg:hidden -ml-2 p-2 rounded-lg text-[#3a5a4a] hover:bg-[#cbd8c8] hover:text-[#1f382a] transition-colors"
        >
            <Menu size={22} aria-hidden />
        </button>
    );

    return (
        <div className="min-h-screen bg-[#f7f8f6] flex">
            <StudioSidebar active={active} isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
            <div className={`flex-1 flex flex-col min-w-0 ${fixedHeight ? 'h-screen overflow-hidden' : ''}`}>
                {active === 'formulations'
                    ? <Header title={title} leading={menuButton} />
                    : <Header title={title} backPath="/studio" backLabel="Back to Studio" leading={menuButton} />}
                {children}
            </div>
        </div>
    );
}
