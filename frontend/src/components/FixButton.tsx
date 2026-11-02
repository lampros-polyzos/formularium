import { Wrench } from 'lucide-react';
import type { Fix } from '../types/fixes';

interface FixButtonProps {
    fix: Fix;
    onFix: (fix: Fix) => void;
}

export default function FixButton({ fix, onFix }: FixButtonProps) {
    return (
        <button
            type="button"
            onClick={() => onFix(fix)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#2c4c3b]/40 bg-white text-[11px] font-bold text-[#2c4c3b] hover:bg-[#2c4c3b] hover:text-white transition-colors"
        >
            <Wrench size={11} aria-hidden /> {fix.label}
        </button>
    );
}
