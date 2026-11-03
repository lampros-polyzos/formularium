import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, BookOpen, Calculator, ChefHat, ClipboardCheck, FlaskConical, Settings, ShoppingCart, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import DueBadge from './DueBadge';
import { SettingsModal } from './SettingsModal';

/** The pages that live in the Studio, so the sidebar can show where you are. */
export type StudioSection = 'formulations' | 'batches' | 'stash' | 'pantry' | 'shopping' | 'containers' | 'tools' | 'metrics' | 'library';

const ROW = 'w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors';
const ACTIVE = 'bg-[#e8f0e5] text-[#1f382a]';
const IDLE = 'text-gray-600 hover:bg-gray-50';

const StashIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
);

const ContainersIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
);

interface Item { id: StudioSection; label: string; to: string; icon: ReactNode; badge?: ReactNode }

const MAIN: Item[] = [
    { id: 'formulations', label: 'My Formulations', to: '/studio', icon: <FlaskConical size={20} aria-hidden /> },
    // Batches: what you've made and how it's aging
    { id: 'batches', label: 'Batches', to: '/batches', icon: <ClipboardCheck size={20} aria-hidden />, badge: <DueBadge /> },
    { id: 'stash', label: 'My Stash', to: '/stash', icon: <StashIcon /> },
    { id: 'pantry', label: 'What can I make?', to: '/what-can-i-make', icon: <ChefHat size={20} aria-hidden /> },
    { id: 'shopping', label: 'Shopping List', to: '/shopping', icon: <ShoppingCart size={20} aria-hidden /> },
    { id: 'containers', label: 'Containers', to: '/containers', icon: <ContainersIcon /> },
    { id: 'tools', label: 'Calculators', to: '/tools', icon: <Calculator size={20} aria-hidden /> },
    { id: 'metrics', label: 'Metrics', to: '/metrics', icon: <BarChart3 size={20} aria-hidden /> },
];

interface StudioSidebarProps {
    active: StudioSection | null;
    /** On small screens the sidebar is a drawer: whether it is showing. Large screens always show it. */
    isOpen?: boolean;
    /** Asks the drawer to close, after a link is followed, the backdrop is tapped or the close button is pressed. */
    onClose?: () => void;
}

/** The left-hand navigation shared by every page in the Studio, so they all stay in step. */
export default function StudioSidebar({ active, isOpen = false, onClose }: StudioSidebarProps) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        navigate('/');
    };

    const link = (item: Item, extra = '') => (
        <Link
            key={item.id}
            to={item.to}
            aria-current={active === item.id ? 'page' : undefined}
            onClick={onClose}
            className={`${ROW} ${item.badge ? 'justify-between' : ''} ${active === item.id ? ACTIVE : IDLE} ${extra}`}
        >
            <span className="flex items-center gap-3">{item.icon}{item.label}</span>
            {item.badge}
        </Link>
    );

    // Small screens: a drawer that slides over the page (hidden, and out of the tab order, until opened).
    // Large screens: always showing, and it stays put while the page scrolls.
    const placement = isOpen ? 'translate-x-0 visible' : '-translate-x-full invisible';

    return (
        <>
            {isOpen && <div data-studio-backdrop onClick={onClose} aria-hidden className="lg:hidden fixed inset-0 z-[45] bg-[#1f382a]/40" />}
        <aside
            id="studio-sidebar"
            data-tour="studio-sidebar"
            data-open={isOpen}
            className={`print:hidden w-64 shrink-0 bg-white border-r border-[#c1d1b9] p-6 flex flex-col h-screen overflow-y-auto transition-[transform,visibility] duration-200 fixed inset-y-0 left-0 z-50 ${placement} lg:sticky lg:top-0 lg:bottom-auto lg:left-auto lg:z-auto lg:translate-x-0 lg:visible lg:self-start`}
        >
            <div className="flex items-center justify-between gap-3 text-[#1f382a] mb-10">
                <div className="flex items-center gap-3">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    <span className="font-bold text-xl">Formularium</span>
                </div>
                <button type="button" onClick={onClose} aria-label="Close menu" className="lg:hidden p-1.5 -mr-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800">
                    <X size={20} aria-hidden />
                </button>
            </div>

            <nav aria-label="Studio" className="flex-1 space-y-2">
                {MAIN.map(item => link(item))}
                {link({ id: 'library', label: 'Ingredients Library', to: '/library', icon: <BookOpen size={20} aria-hidden /> }, 'mt-4 border-t border-gray-100 pt-6')}
                <button type="button" onClick={() => { onClose?.(); setIsSettingsOpen(true); }} className={`${ROW} ${IDLE}`}>
                    <Settings size={20} aria-hidden />
                    Settings
                </button>
            </nav>

            <div className="pt-6 border-t border-gray-100">
                <p className="text-sm text-gray-500 mb-4 truncate">{user?.email}</p>
                <button
                    onClick={handleSignOut}
                    className="w-full py-2.5 px-4 rounded-xl border border-gray-300 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                    Sign Out
                </button>
            </div>

            {/*
              A sticky element forms its own stacking layer, so a modal inside it would sit under the page's top bar and
              sticky table headers. Rendering it on the page itself keeps it above everything.
            */}
            {createPortal(<SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />, document.body)}
        </aside>
        </>
    );
}
