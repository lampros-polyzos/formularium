// Original hero artwork: a home-lab still life in the Formularium palette.
// Inline SVG so it stays sharp at any size and needs no image request. Ids are prefixed because
// inline SVG ids are global to the page.

const FLASK = 'M188 140 H222 V225 L283 372 Q293 398 268 402 H142 Q117 398 127 372 L188 225 Z';
const BEAKER = 'M318 235 V398 Q318 410 330 410 H406 Q418 410 418 398 V235 Z';

const STYLE = `
  .hero-float { animation: hero-float 6s ease-in-out infinite alternate; }
  .hero-float-b { animation: hero-float 7s ease-in-out -2s infinite alternate; }
  .hero-rise { animation: hero-rise 4.5s ease-in infinite; }
  @keyframes hero-float { from { transform: translateY(0); } to { transform: translateY(-8px); } }
  @keyframes hero-rise { 0% { transform: translateY(0); opacity: 0; } 15% { opacity: .9; } 100% { transform: translateY(-34px); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .hero-float, .hero-float-b, .hero-rise { animation: none; } }
`;

export default function HeroIllustration({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 560 480"
            className={className}
            role="img"
            aria-label="Illustration of a home formulation lab: a flask, a beaker of oil and water, a dropper bottle and a cream jar among green leaves"
            xmlns="http://www.w3.org/2000/svg"
        >
            <title>A home formulation lab</title>
            <style>{STYLE}</style>
            <defs>
                <linearGradient id="hero-green" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#b4dcc4" />
                    <stop offset="1" stopColor="#6fae8a" />
                </linearGradient>
                <linearGradient id="hero-water" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#c3e1d0" />
                    <stop offset="1" stopColor="#8fc3a8" />
                </linearGradient>
                <linearGradient id="hero-oil" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#f6e3a1" />
                    <stop offset="1" stopColor="#e6c264" />
                </linearGradient>
                <linearGradient id="hero-amber" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#e2a850" />
                    <stop offset="1" stopColor="#a8671f" />
                </linearGradient>
                <linearGradient id="hero-glass" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
                    <stop offset="1" stopColor="#ffffff" stopOpacity="0.35" />
                </linearGradient>
                <clipPath id="hero-flask-clip"><path d={FLASK} /></clipPath>
                <clipPath id="hero-beaker-clip"><path d={BEAKER} /></clipPath>
                <filter id="hero-shadow" x="-20%" y="-20%" width="140%" height="160%">
                    <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#1f382a" floodOpacity="0.16" />
                </filter>
                <path id="hero-leaf" d="M0 0 C 10 -14 28 -14 38 0 C 28 14 10 14 0 0 Z" />
            </defs>

            {/* Backdrop */}
            <circle cx="280" cy="255" r="218" fill="#eef2eb" />
            <circle cx="280" cy="255" r="236" fill="none" stroke="#c1d1b9" strokeWidth="1.5" strokeDasharray="3 9" strokeLinecap="round" />
            <ellipse cx="280" cy="428" rx="236" ry="20" fill="#1f382a" opacity="0.1" />
            <rect x="34" y="421" width="492" height="10" rx="5" fill="#1f382a" opacity="0.14" />

            {/* Botanicals behind the glassware */}
            <g>
                <path d="M92 350 C 70 285, 78 215, 118 152" fill="none" stroke="#5f8a72" strokeWidth="3" strokeLinecap="round" />
                <use href="#hero-leaf" transform="translate(86 322) rotate(-160)" fill="#5f8a72" />
                <use href="#hero-leaf" transform="translate(88 296) rotate(-20)" fill="#8ca89b" />
                <use href="#hero-leaf" transform="translate(84 268) rotate(-165)" fill="#5f8a72" />
                <use href="#hero-leaf" transform="translate(90 240) rotate(-15)" fill="#8ca89b" />
                <use href="#hero-leaf" transform="translate(99 210) rotate(-155)" fill="#5f8a72" />
                <use href="#hero-leaf" transform="translate(107 184) rotate(-30)" fill="#8ca89b" />
                <use href="#hero-leaf" transform="translate(118 154) rotate(-85)" fill="#5f8a72" />
            </g>
            <g>
                <path d="M512 402 C 532 335, 532 262, 502 192" fill="none" stroke="#8ca89b" strokeWidth="3" strokeLinecap="round" />
                <use href="#hero-leaf" transform="translate(528 352) rotate(-172) scale(0.9)" fill="#8ca89b" />
                <use href="#hero-leaf" transform="translate(530 322) rotate(-35) scale(0.75)" fill="#5f8a72" />
                <use href="#hero-leaf" transform="translate(522 288) rotate(-168) scale(0.9)" fill="#8ca89b" />
                <use href="#hero-leaf" transform="translate(518 256) rotate(-30) scale(0.75)" fill="#5f8a72" />
                <use href="#hero-leaf" transform="translate(508 226) rotate(-160) scale(0.85)" fill="#8ca89b" />
                <use href="#hero-leaf" transform="translate(502 194) rotate(-95) scale(0.8)" fill="#5f8a72" />
            </g>

            {/* Molecule motif */}
            <g opacity="0.85">
                <polygon points="470,69 492.5,82 492.5,108 470,121 447.5,108 447.5,82" fill="none" stroke="#8ca89b" strokeWidth="2" />
                <line x1="492.5" y1="82" x2="520" y2="66" stroke="#8ca89b" strokeWidth="2" />
                <line x1="447.5" y1="108" x2="420" y2="124" stroke="#8ca89b" strokeWidth="2" />
                {[[470, 69], [492.5, 82], [492.5, 108], [470, 121], [447.5, 108], [447.5, 82]].map(([x, y]) => (
                    <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill="#fbf8ee" stroke="#8ca89b" strokeWidth="2" />
                ))}
                <circle cx="520" cy="66" r="7" fill="#e3bd5a" />
                <circle cx="420" cy="124" r="6" fill="#5f8a72" />
            </g>

            {/* Conical flask */}
            <g filter="url(#hero-shadow)">
                <path d={FLASK} fill="url(#hero-glass)" />
            </g>
            <g clipPath="url(#hero-flask-clip)">
                <path d="M100 300 Q130 288 160 300 T220 300 T280 300 T340 300 V420 H100 Z" fill="url(#hero-green)" />
                <path d="M100 300 Q130 288 160 300 T220 300 T280 300 T340 300" fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.6" />
                <circle cx="180" cy="350" r="5" fill="#fff" opacity="0.5" />
                <circle cx="228" cy="372" r="7" fill="#fff" opacity="0.4" />
                <circle cx="205" cy="330" r="3.5" fill="#fff" opacity="0.55" />
                <circle className="hero-rise" cx="240" cy="360" r="4" fill="#fff" />
                <circle className="hero-rise" cx="170" cy="380" r="3" fill="#fff" style={{ animationDelay: '-2s' }} />
            </g>
            <path d={FLASK} fill="none" stroke="#8fae9d" strokeWidth="3" strokeLinejoin="round" />
            <rect x="181" y="131" width="48" height="12" rx="5" fill="#f4f8f2" stroke="#8fae9d" strokeWidth="3" />
            <path d="M196 152 V224 L141 364" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.65" />
            {/* Volume marks */}
            {[250, 280, 330].map((y, i) => (
                <line key={y} x1={i === 1 ? 206 : 212} y1={y} x2="222" y2={y} stroke="#8fae9d" strokeWidth="2" strokeLinecap="round" transform={`translate(${(y - 225) * 0.38 + 8} 0)`} />
            ))}

            {/* Beaker: water below, oil above */}
            <g filter="url(#hero-shadow)">
                <path d={BEAKER} fill="url(#hero-glass)" />
            </g>
            <g clipPath="url(#hero-beaker-clip)">
                <rect x="310" y="322" width="116" height="94" fill="url(#hero-water)" />
                <rect x="310" y="282" width="116" height="42" fill="url(#hero-oil)" />
                <path d="M310 322 Q330 318 350 322 T390 322 T430 322" fill="none" stroke="#fff" strokeWidth="2" opacity="0.7" />
                <circle cx="342" cy="372" r="4" fill="#fff" opacity="0.5" />
                <circle cx="372" cy="388" r="5.5" fill="#fff" opacity="0.4" />
                <circle cx="396" cy="360" r="3" fill="#fff" opacity="0.55" />
                <circle className="hero-rise" cx="356" cy="392" r="3.5" fill="#fff" style={{ animationDelay: '-1s' }} />
            </g>
            <path d={BEAKER} fill="none" stroke="#8fae9d" strokeWidth="3" strokeLinejoin="round" />
            <path d="M312 234 H424 M318 235 L308 228" fill="none" stroke="#8fae9d" strokeWidth="3" strokeLinecap="round" />
            <path d="M327 250 V392" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.65" />
            {[262, 290, 318, 346, 374].map((y, i) => (
                <line key={y} x1={i % 2 === 0 ? 400 : 406} y1={y} x2="418" y2={y} stroke="#8fae9d" strokeWidth="2" strokeLinecap="round" />
            ))}

            {/* Pipette adding a drop of oil */}
            <g>
                <rect x="372" y="116" width="24" height="38" rx="11" fill="#2c4c3b" />
                <rect x="369" y="152" width="30" height="9" rx="3" fill="#1f382a" />
                <path d="M377 161 H391 V200 L385 227 H383 L377 200 Z" fill="url(#hero-glass)" stroke="#8fae9d" strokeWidth="2" strokeLinejoin="round" />
                <path d="M384 240 Q377 250 384 257 Q391 250 384 240 Z" fill="#e6c264" className="hero-rise" />
            </g>

            {/* Dropper bottle */}
            <g filter="url(#hero-shadow)">
                <path d="M462 300 H494 V318 Q508 326 508 342 V408 Q508 420 496 420 H460 Q448 420 448 408 V342 Q448 326 462 318 Z" fill="url(#hero-amber)" />
                <rect x="458" y="288" width="40" height="14" rx="3" fill="#1f382a" />
                <path d="M468 288 V262 Q468 238 478 238 Q488 238 488 262 V288 Z" fill="#2c4c3b" />
                <rect x="455" y="338" width="6" height="72" rx="3" fill="#fff" opacity="0.35" />
                <rect x="458" y="350" width="44" height="46" rx="5" fill="#fbf8ee" />
                <path d="M480 386 C 470 378 470 364 480 358 C 490 364 490 378 480 386 Z" fill="#5f8a72" />
                <path d="M480 386 V366" stroke="#fbf8ee" strokeWidth="1.5" />
                <rect x="465" y="389" width="30" height="2.5" rx="1.25" fill="#c1d1b9" />
            </g>

            {/* Cream jar */}
            <g filter="url(#hero-shadow)">
                <rect x="58" y="374" width="84" height="48" rx="11" fill="#fbf8ee" stroke="#c1d1b9" strokeWidth="2" />
                <rect x="54" y="350" width="92" height="28" rx="8" fill="#2c4c3b" />
                <rect x="61" y="356" width="78" height="4" rx="2" fill="#fff" opacity="0.18" />
                <rect x="72" y="388" width="56" height="22" rx="5" fill="#d8e2d3" />
                <circle cx="86" cy="399" r="5" fill="#2c4c3b" />
                <rect x="96" y="394" width="26" height="3" rx="1.5" fill="#8ca89b" />
                <rect x="96" y="401" width="18" height="3" rx="1.5" fill="#8ca89b" />
            </g>

            {/* Floating status chips echo the app's live checks */}
            <g className="hero-float" filter="url(#hero-shadow)">
                <rect x="40" y="62" width="132" height="38" rx="19" fill="#fff" />
                <circle cx="62" cy="81" r="7" fill="#4caf7d" />
                <path d="M58.5 81 L61 83.5 L65.5 78.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <text x="76" y="86" fontSize="13" fontWeight="700" fill="#1f382a" fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif">pH 5.5 · stable</text>
            </g>
            <g className="hero-float-b" filter="url(#hero-shadow)">
                <rect x="236" y="40" width="122" height="38" rx="19" fill="#fff" />
                <circle cx="258" cy="59" r="7" fill="#e3bd5a" />
                <text x="272" y="64" fontSize="13" fontWeight="700" fill="#1f382a" fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif">Total 100%</text>
            </g>

            {/* Drifting droplets */}
            <g opacity="0.8">
                <circle cx="30" cy="250" r="6" fill="#cfe0d3" />
                <circle cx="46" cy="214" r="3.5" fill="#b9ccb2" />
                <circle cx="548" cy="300" r="5" fill="#cfe0d3" />
                <circle cx="266" cy="118" r="4" fill="#e6c264" opacity="0.7" />
            </g>
        </svg>
    );
}
