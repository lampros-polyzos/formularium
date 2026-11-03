import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface TourStep {
    target?: string; // value of a data-tour attribute; omit for a centered intro/outro card
    title: string;
    body: ReactNode;
}

// Mount only while the tour is running, so each run starts at step 1
interface GuidedTourProps {
    steps: TourStep[];
    onClose: () => void;
    /** What the last step's button says. */
    finishLabel?: string;
}

interface Rect { top: number; left: number; width: number; height: number; }

const PADDING = 8;      // breathing room around the highlighted element
const CARD_WIDTH = 340;
const GAP = 12;         // distance between highlight and card
const MOBILE_BREAKPOINT = 640;

const findTarget = (target?: string) =>
    target ? document.querySelector<HTMLElement>(`[data-tour="${target}"]`) : null;

export default function GuidedTour({ steps, onClose, finishLabel = 'Start formulating' }: GuidedTourProps) {
    const [index, setIndex] = useState(0);
    const [rect, setRect] = useState<Rect | null>(null);
    const [cardHeight, setCardHeight] = useState(0);
    const cardRef = useRef<HTMLDivElement>(null);

    // Skip steps whose element isn't on screen (e.g. hidden on this layout)
    const visibleSteps = steps.filter(s => !s.target || findTarget(s.target));
    const step = visibleSteps[Math.min(index, visibleSteps.length - 1)];
    const isFirst = index === 0;
    const isLast = index >= visibleSteps.length - 1;

    const measure = useCallback(() => {
        const el = findTarget(step?.target);
        if (!el) { setRect(null); return; }
        const r = el.getBoundingClientRect();
        // Clamp to the viewport so very tall sections still get a sensible highlight
        const top = Math.max(r.top - PADDING, PADDING);
        const bottom = Math.min(r.bottom + PADDING, window.innerHeight - PADDING);
        setRect({
            top,
            left: r.left - PADDING,
            width: r.width + PADDING * 2,
            height: Math.max(bottom - top, 0),
        });
    }, [step?.target]);

    // Bring the step's element into view, then keep the highlight glued to it
    useEffect(() => {
        if (!step) return;
        findTarget(step.target)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const frame = requestAnimationFrame(measure);
        const settle = setTimeout(measure, 400); // after smooth scrolling finishes
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
            cancelAnimationFrame(frame);
            clearTimeout(settle);
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [step, measure]);

    useLayoutEffect(() => {
        if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
    }, [index, rect]);

    const next = useCallback(() => (isLast ? onClose() : setIndex(i => i + 1)), [isLast, onClose]);
    const back = useCallback(() => setIndex(i => Math.max(0, i - 1)), []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
            else if (e.key === 'ArrowLeft') back();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [next, back, onClose]);

    useEffect(() => {
        cardRef.current?.focus();
    }, [index]);

    if (!step) return null;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isMobile = vw < MOBILE_BREAKPOINT;

    // Card placement: centered with no target, docked at the bottom on phones,
    // otherwise below the highlight if it fits, else above, else inside the viewport bottom
    let cardStyle: React.CSSProperties;
    if (!rect) {
        cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: Math.min(CARD_WIDTH + 60, vw - 32) };
    } else if (isMobile) {
        cardStyle = { left: 16, right: 16, bottom: 16 };
    } else {
        const left = Math.min(Math.max(rect.left, 16), vw - CARD_WIDTH - 16);
        const below = rect.top + rect.height + GAP;
        const above = rect.top - GAP - cardHeight;
        const top = below + cardHeight < vh - 16 ? below : above > 16 ? above : vh - cardHeight - 16;
        cardStyle = { top, left, width: CARD_WIDTH };
    }

    return (
        <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
            {/* Blocks clicks on the page while the tour runs */}
            <div className={`absolute inset-0 ${rect ? '' : 'bg-black/50'}`} onClick={onClose} />

            {rect && (
                <div
                    className="absolute rounded-xl ring-2 ring-amber-400 pointer-events-none transition-all duration-300 ease-out"
                    style={{ ...rect, boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)' }}
                />
            )}

            <div
                ref={cardRef}
                tabIndex={-1}
                className="absolute bg-white rounded-xl shadow-2xl border border-[#c1d1b9] outline-none overflow-hidden transition-[top,left] duration-300 ease-out"
                style={cardStyle}
            >
                <div className="h-1 bg-[#e9eee7]">
                    <div
                        className="h-full bg-[#2c4c3b] transition-all duration-300"
                        style={{ width: `${((index + 1) / visibleSteps.length) * 100}%` }}
                    />
                </div>

                <div className="p-5">
                    <div className="flex justify-between items-start gap-3 mb-2">
                        <h3 id="tour-title" className="font-bold text-[#1f382a] text-base">{step.title}</h3>
                        <span className="text-[10px] font-mono text-gray-400 whitespace-nowrap pt-1">
                            {index + 1} / {visibleSteps.length}
                        </span>
                    </div>
                    <div className="text-sm text-gray-600 leading-relaxed space-y-2">{step.body}</div>
                </div>

                <div className="px-5 py-3 bg-[#f7f8f6] border-t border-gray-100 flex items-center justify-between">
                    <button onClick={onClose} className="text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors">
                        {isLast ? 'Close' : 'Skip tour'}
                    </button>
                    <div className="flex gap-2">
                        {!isFirst && (
                            <button
                                onClick={back}
                                className="px-3 py-1.5 text-sm font-medium bg-white border border-[#c1d1b9] rounded hover:bg-gray-50 transition-colors"
                            >
                                Back
                            </button>
                        )}
                        <button
                            onClick={next}
                            className="px-4 py-1.5 text-sm font-bold text-white bg-[#1f382a] rounded hover:bg-[#2c4c3b] transition-colors"
                        >
                            {isLast ? finishLabel : isFirst ? "Let's go" : 'Next'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
