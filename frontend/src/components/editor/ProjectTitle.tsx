import { useState, type ReactNode } from 'react';

interface ProjectTitleProps {
    projectName: string;
    onProjectNameChange: (name: string) => void;
    /** Shown under the name, e.g. the autosave status. */
    children?: ReactNode;
}

export default function ProjectTitle({ projectName, onProjectNameChange, children }: ProjectTitleProps) {
    const [isEditingName, setIsEditingName] = useState(false);

    return (
        <div className="min-w-0 flex-1">
            {isEditingName ? (
                <input
                    type="text"
                    value={projectName}
                    onChange={(e) => onProjectNameChange(e.target.value)}
                    onBlur={() => setIsEditingName(false)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingName(false); }}
                    autoFocus
                    aria-label="Project name"
                    className="w-full max-w-md text-2xl font-bold text-[#1f382a] bg-white border border-[#c1d1b9] rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-[#2c4c3b] shadow-sm"
                />
            ) : (
                <h2 className="text-2xl font-bold text-[#1f382a] min-w-0">
                    <button
                        type="button"
                        onClick={() => setIsEditingName(true)}
                        aria-label="Edit project name"
                        title="Click to rename"
                        className="group flex items-center gap-2 max-w-full text-left"
                    >
                        <span className="truncate">{projectName}</span>
                        <svg className="w-4 h-4 shrink-0 text-gray-400 group-hover:text-[#2c4c3b] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                    </button>
                </h2>
            )}
            <div className="mt-0.5 min-h-[1rem]">
                {children}
            </div>
        </div>
    );
}
