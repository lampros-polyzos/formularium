import React from 'react';
import { useNavigate, Link } from 'react-router-dom';

interface HeaderProps {
    title: string;
    backPath?: string;
    backLabel?: string;
    children?: React.ReactNode; // This allows us to inject custom buttons on the right side
}

export default function Header({ title, backPath, backLabel, children }: HeaderProps) {
    const navigate = useNavigate();

    return (
        <header className="bg-[#dbe3da] px-6 py-3 flex items-center justify-between border-b border-[#c1d1b9] sticky top-0 z-40">
            <div className="flex items-center gap-4">
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

            <div className="flex gap-6 text-sm font-medium items-center relative">
                {/* Custom page-specific buttons injected here */}
                {children}

                {/* Global Links (Always visible) */}
                <Link to="/" className="text-[#3a5a4a] hover:text-[#1f382a] hover:underline transition-colors">
                    Home
                </Link>
                <Link to="/studio" className="text-[#3a5a4a] hover:text-[#1f382a] hover:underline transition-colors">
                    Studio
                </Link>
                <Link to="/community" className="text-[#3a5a4a] hover:text-[#1f382a] hover:underline transition-colors">
                    Community
                </Link>
            </div>
        </header>
    );
}