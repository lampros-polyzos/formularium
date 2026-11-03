import { useState } from 'react';
import { PackageCheck } from 'lucide-react';

interface EditorActionsProps {
    isSaving: boolean;
    hasIngredients: boolean;
    hasSourcing: boolean;
    isHealthCheckPassed: boolean;
    /** Null until the formula has been saved once. */
    formulaId: string | null;
    onSave: () => void;
    onMakeBatch: () => void;
    onShare: () => void;
    onClone: () => void | Promise<void>;
    onSaveVersion: () => void;
    onHistory: () => void;
    onExportPDF: (documentType: 'pif' | 'batch' | 'shopping') => void | Promise<void>;
    onExportSourcing: () => void | Promise<void>;
}

export default function EditorActions({
    isSaving, hasIngredients, hasSourcing, isHealthCheckPassed, formulaId,
    onSave, onMakeBatch, onShare, onClone, onSaveVersion, onHistory, onExportPDF, onExportSourcing,
}: EditorActionsProps) {
    const [showPrintMenu, setShowPrintMenu] = useState(false);

    return (
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0" data-tour="actions">
            <button
                onClick={onSave}
                disabled={isSaving}
                className={`px-4 py-1.5 text-white rounded shadow-sm text-sm font-medium transition-colors
                    ${isSaving ? 'bg-[#3a5a4a] cursor-not-allowed' : 'bg-[#1f382a] hover:bg-[#2c4c3b]'}`}
            >
                {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
                onClick={onMakeBatch}
                disabled={isSaving || !hasIngredients}
                title={!hasIngredients ? "Add ingredients first" : "Log a real batch of this formula, optionally using up your stash"}
                className={`px-3 py-1.5 bg-white border border-[#c1d1b9] rounded shadow-sm text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap
                    ${isSaving || !hasIngredients ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
            >
                <PackageCheck size={14} aria-hidden /> Make batch
            </button>
            <button
                onClick={onShare}
                disabled={isSaving || !isHealthCheckPassed}
                title={!isHealthCheckPassed ? "Resolve all companion warnings to share this formula" : "Publish this recipe to the Community Hub"}
                className={`px-3 py-1.5 border rounded shadow-sm text-sm font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap
                    ${(isSaving || !isHealthCheckPassed)
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60'
                        : 'bg-[#e9eee7] text-[#2c4c3b] border-[#c1d1b9] hover:bg-[#dbe3da]'}`}
            >
                <span aria-hidden>🌎</span> Share
            </button>
            <div className="relative">
                <button
                    onClick={() => setShowPrintMenu(!showPrintMenu)}
                    disabled={isSaving}
                    aria-haspopup="menu"
                    aria-expanded={showPrintMenu}
                    className="px-3 py-1.5 bg-white border border-[#c1d1b9] rounded shadow-sm text-sm font-medium hover:bg-gray-50 flex items-center gap-1 transition-colors"
                >
                    More
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {showPrintMenu && (
                    <div role="menu" className="absolute right-0 mt-1 w-60 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden">
                        <button
                            role="menuitem"
                            onClick={() => { setShowPrintMenu(false); void onClone(); }}
                            disabled={!formulaId}
                            title={!formulaId ? "Save this project first before cloning" : "Duplicate this formula"}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-100 flex justify-between items-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Clone this formula <span className="text-xs text-gray-400" aria-hidden>⎘</span>
                        </button>
                        <button
                            role="menuitem"
                            onClick={() => { setShowPrintMenu(false); onSaveVersion(); }}
                            disabled={!formulaId || !hasIngredients}
                            title={!formulaId ? "Save this project first" : !hasIngredients ? "Add ingredients first" : "Keep a copy of this formula with a note on what changed"}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-100 flex justify-between items-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Save a version… <span className="text-xs text-gray-400" aria-hidden>🕘</span>
                        </button>
                        <button
                            role="menuitem"
                            onClick={() => { setShowPrintMenu(false); onHistory(); }}
                            disabled={!formulaId}
                            title={!formulaId ? "Save this project first" : "See earlier versions and compare them"}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-100 flex justify-between items-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Version history <span className="text-xs text-gray-400" aria-hidden>⇄</span>
                        </button>
                        <div className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Print &amp; export</div>
                        <button
                            role="menuitem"
                            onClick={() => { setShowPrintMenu(false); void onExportPDF('batch'); }}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-100 flex justify-between items-center"
                        >
                            Lab Batch Ticket <span className="text-xs text-gray-400" aria-hidden>🖨️</span>
                        </button>
                        <button
                            role="menuitem"
                            onClick={() => { setShowPrintMenu(false); void onExportPDF('shopping'); }}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-100 flex justify-between items-center"
                        >
                            Shopping List <span className="text-xs text-gray-400" aria-hidden>🛒</span>
                        </button>
                        <button
                            role="menuitem"
                            onClick={() => { setShowPrintMenu(false); void onExportSourcing(); }}
                            disabled={!hasSourcing}
                            title={!hasSourcing ? "Add ingredients first" : "Stash check, substitutions and shopping options"}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-100 flex justify-between items-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Substitutions &amp; Sourcing <span className="text-xs text-gray-400" aria-hidden>⇄</span>
                        </button>
                        <button
                            role="menuitem"
                            onClick={() => { setShowPrintMenu(false); void onExportPDF('pif'); }}
                            className="w-full text-left px-4 py-2.5 text-sm font-medium text-[#2c4c3b] hover:bg-gray-50 flex justify-between items-center"
                        >
                            Download PIF (PDF) <span className="text-xs text-[#2c4c3b]" aria-hidden>↓</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
