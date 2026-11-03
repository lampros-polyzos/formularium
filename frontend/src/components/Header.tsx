import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import NotificationBell from './NotificationBell';
import BatchesNavLink from './BatchesNavLink';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { SettingsModal } from './SettingsModal';

interface HeaderProps {
    title: string;
    backPath?: string;
    backLabel?: string;
    children?: React.ReactNode; // This allows us to inject custom buttons on the right side
    /** Shown before everything else on the left, e.g. the button that opens the Studio menu on small screens. */
    leading?: React.ReactNode;
}

export default function Header({ title, backPath, backLabel, children, leading }: HeaderProps) {
    const navigate = useNavigate();
    const { user, username } = useAuth();

    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsProfileOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        navigate('/login');
    };

    const avatarLetter = username ? username.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase() || '?';

    return (
        <>
            <header className="print:hidden bg-[#dbe3da] px-6 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[#c1d1b9] sticky top-0 z-40">
                <div className="flex items-center gap-4">
                    {leading}
                    {backPath && (
                        <>
                            <button
                                onClick={() => navigate(backPath)}
                                className="text-[#3a5a4a] hover:text-[#1f382a] font-medium flex items-center gap-1 transition-colors"
                            >
                                <span>&larr;</span> {backLabel || 'Back'}
                            </button>
                            <span className="text-gray-400">|</span>
                        </>
                    )}
                    <h1 className="font-semibold text-[#1f382a]">{title}</h1>
                </div>

                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium items-center relative">
                    {/* Custom page-specific buttons injected here */}
                    {children}

                    {user && <NotificationBell />}

                    {/* Global Links */}
                    <Link to="/" className="text-[#3a5a4a] hover:text-[#1f382a] hover:underline transition-colors">
                        Home
                    </Link>
                    <Link to="/community" className="text-[#3a5a4a] hover:text-[#1f382a] hover:underline transition-colors">
                        Community
                    </Link>
                    {user && <BatchesNavLink className="text-[#3a5a4a] hover:text-[#1f382a] hover:underline transition-colors" />}
                    <Link to="/tools" className="text-[#3a5a4a] hover:text-[#1f382a] hover:underline transition-colors">Tools</Link>
                    <Link to="/learn" className="text-[#3a5a4a] hover:text-[#1f382a] hover:underline transition-colors">
                        Learn
                    </Link>
                    <Link to="/blog" className="text-[#3a5a4a] hover:text-[#1f382a] hover:underline transition-colors">
                        Blog
                    </Link>

                    {/* User Profile Dropdown */}
                    {user && (
                        <div className="relative ml-2" ref={dropdownRef}>
                            <button
                                onClick={() => setIsProfileOpen(!isProfileOpen)}
                                className="flex items-center justify-center w-8 h-8 rounded-full bg-[#2c4c3b] text-white font-bold hover:bg-[#1f382a] transition-transform active:scale-95 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#2c4c3b]"
                            >
                                {avatarLetter}
                            </button>

                            {isProfileOpen && (
                                <div className="absolute right-0 mt-3 w-56 bg-white border border-[#c1d1b9] rounded-xl shadow-xl py-2 z-50">
                                    {/* User Info Header */}
                                    <div className="px-4 py-3 border-b border-gray-100 mb-2">
                                        <p className="text-sm font-bold text-[#1f382a] truncate">
                                            {username || 'Anonymous User'}
                                        </p>
                                        <p className="text-xs text-gray-500 truncate">
                                            {user.email}
                                        </p>
                                    </div>

                                    {/* Dropdown Links */}
                                    <Link
                                        to="/studio"
                                        onClick={() => setIsProfileOpen(false)}
                                        className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-[#2c4c3b] transition-colors"
                                    >
                                        <span>🧪</span> My Studio
                                    </Link>

                                    <button
                                        onClick={() => { setIsProfileOpen(false); setIsSettingsOpen(true); }}
                                        className="w-full flex items-center gap-3 text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-[#2c4c3b] transition-colors"
                                    >
                                        <span>⚙️</span> Global Settings
                                    </button>

                                    <div className="h-px bg-gray-100 my-2"></div>

                                    <button
                                        onClick={handleSignOut}
                                        className="w-full flex items-center gap-3 text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium"
                                    >
                                        <span>🚪</span> Sign Out
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </header>

            {/* Settings Modal mounted globally to the header */}
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />
        </>
    );
}