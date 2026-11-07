import React, { useMemo } from 'react';
import { CLAIM_LABELS } from '../types/claims';
import type { MarketingClaim, ClaimViolation } from '../types/claims';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

interface ClaimsPanelProps {
    selectedClaims: MarketingClaim[];
    violations: ClaimViolation[];
    onChangeClaims: (claims: MarketingClaim[]) => void;
}

const AVAILABLE_CLAIMS: MarketingClaim[] = [
    'VEGAN', 'SULFATE_FREE', 'SILICONE_FREE',
    'PARABEN_FREE', 'FRAGRANCE_FREE', 'COSMOS', 'NON_COMEDOGENIC'
];

export const ClaimsPanel: React.FC<ClaimsPanelProps> = ({
    selectedClaims,
    violations,
    onChangeClaims
}) => {
    const toggleClaim = (claim: MarketingClaim) => {
        if (selectedClaims.includes(claim)) {
            onChangeClaims(selectedClaims.filter(c => c !== claim));
        } else {
            onChangeClaims([...selectedClaims, claim]);
        }
    };

    // Group violations by claim to save UI space
    const groupedViolations = useMemo(() => {
        return violations.reduce((acc, violation) => {
            if (!acc[violation.claim]) {
                acc[violation.claim] = [];
            }
            acc[violation.claim].push(violation);
            return acc;
        }, {} as Record<string, ClaimViolation[]>);
    }, [violations]);

    return (
        <div className="bg-[#f7f8f6] border border-[#c1d1b9] rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#1f382a]">
                        Marketing Claims & Constraints
                    </h3>
                </div>
                {selectedClaims.length > 0 && violations.length === 0 && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 bg-green-100 text-green-800 rounded-full">
                        <ShieldCheck size={12} /> Verified
                    </span>
                )}
            </div>

            <div className={`flex flex-wrap gap-1.5${violations.length > 0 ? ' mb-3' : ''}`}>
                {AVAILABLE_CLAIMS.map(claim => {
                    const isSelected = selectedClaims.includes(claim);
                    const hasViolation = violations.some(v => v.claim === claim);

                    return (
                        <button
                            key={claim}
                            type="button"
                            onClick={() => toggleClaim(claim)}
                            className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors border ${isSelected
                                ? hasViolation
                                    ? 'bg-amber-100 border-amber-300 text-amber-900'
                                    : 'bg-[#2c4c3b] border-[#2c4c3b] text-white'
                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                                }`}
                        >
                            {CLAIM_LABELS[claim]}
                            {isSelected && hasViolation && ' ⚠️'}
                        </button>
                    );
                })}
            </div>

            {violations.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs space-y-2">
                    <div className="font-semibold text-amber-800 flex items-center gap-1.5">
                        <AlertTriangle size={15} />
                        Compliance Conflicts Detected ({violations.length})
                    </div>

                    <ul className="space-y-2.5 text-amber-900 mt-2">
                        {Object.entries(groupedViolations).map(([claim, group]) => {
                            // Extract unique ingredient names to prevent duplicates if any occur
                            const uniqueIngredients = Array.from(new Set(group.map(v => v.ingredientName))).join(', ');

                            return (
                                <li key={claim} className="leading-tight border-l-2 border-amber-300 pl-2 ml-1">
                                    <div className="mb-0.5">
                                        <span className="font-bold underline mr-1">{CLAIM_LABELS[claim as MarketingClaim]}:</span>
                                        <span className="font-semibold">{uniqueIngredients}</span>
                                    </div>
                                    <div className="text-amber-800/80 text-[11px]">
                                        {group[0].reason}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
};