/** Decorative, self-contained court art: no image requests or client JavaScript. */
export default function CourtIllustration() {
  return (
    <svg viewBox="0 0 480 470" fill="none" aria-hidden="true" focusable="false" className="block h-auto w-full">
      <defs>
        <pattern id="court-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#94a3b8" opacity=".18" /></pattern>
        <pattern id="paddle-grip" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-25)"><path d="M0 0H8" stroke="#64748b" strokeWidth="3" /></pattern>
        <linearGradient id="court-surface" x1="50" y1="40" x2="440" y2="440" gradientUnits="userSpaceOnUse"><stop stopColor="#203d39" /><stop offset="1" stopColor="#142321" /></linearGradient>
        <linearGradient id="lime-paddle" x1="0" y1="0" x2="130" y2="170" gradientUnits="userSpaceOnUse"><stop stopColor="#d9f99d" /><stop offset="1" stopColor="#a3e635" /></linearGradient>
        <radialGradient id="pickleball" cx=".3" cy=".25" r=".8"><stop stopColor="#ecfccb" /><stop offset=".5" stopColor="#bef264" /><stop offset="1" stopColor="#84cc16" /></radialGradient>
      </defs>
      <rect width="480" height="470" fill="url(#court-dots)" />
      <circle cx="245" cy="220" r="198" stroke="#bef264" strokeOpacity=".1" strokeDasharray="4 10" />
      <g transform="translate(240 230) rotate(-12) translate(-240 -230)">
        <rect x="70" y="36" width="340" height="392" rx="25" fill="url(#court-surface)" stroke="#bef264" strokeOpacity=".25" />
        <path d="M101 67H379V397H101V67Z M101 180H379 M101 284H379 M240 67V180 M240 284V397" stroke="#d9f99d" strokeOpacity=".65" strokeWidth="2" />
        <path d="M101 180H379V284H101Z" fill="#bef264" fillOpacity=".06" />
        <path d="M87 232H393" stroke="#020617" strokeWidth="9" />
        <path d="M87 230H393" stroke="#e2e8f0" strokeWidth="2" strokeDasharray="3 3" />
        <circle cx="87" cy="232" r="5" fill="#e2e8f0" /><circle cx="393" cy="232" r="5" fill="#e2e8f0" />
      </g>
      <ellipse cx="238" cy="359" rx="123" ry="26" fill="#020617" opacity=".25" />
      <g transform="translate(108 181) rotate(-28 70 100)">
        <rect x="53" y="137" width="34" height="112" rx="13" fill="#020617" />
        <rect x="58" y="155" width="24" height="86" rx="8" fill="#334155" />
        <rect x="58" y="155" width="24" height="86" rx="8" fill="url(#paddle-grip)" />
        <rect x="4" y="4" width="132" height="157" rx="49" fill="#020617" />
        <rect x="10" y="10" width="120" height="145" rx="44" fill="#334155" stroke="#94a3b8" strokeWidth="2" />
        <path d="M24 102L116 48M24 119L116 65" stroke="#bef264" strokeWidth="7" />
        <circle cx="70" cy="45" r="9" stroke="#94a3b8" strokeWidth="2" />
      </g>
      <g transform="translate(248 128) rotate(27 65 100)">
        <rect x="48" y="137" width="34" height="112" rx="13" fill="#020617" />
        <rect x="53" y="155" width="24" height="86" rx="8" fill="#334155" />
        <rect x="53" y="155" width="24" height="86" rx="8" fill="url(#paddle-grip)" />
        <rect x="-1" y="4" width="132" height="157" rx="49" fill="#020617" />
        <rect x="5" y="10" width="120" height="145" rx="44" fill="url(#lime-paddle)" stroke="#ecfccb" strokeWidth="2" />
        <path d="M19 102L111 48M19 119L111 65" stroke="#365314" strokeWidth="7" />
        <circle cx="65" cy="45" r="9" stroke="#365314" strokeWidth="2" />
      </g>
      <path d="M135 116C152 85 190 75 221 90" stroke="#bef264" strokeOpacity=".7" strokeWidth="2" strokeDasharray="5 7" strokeLinecap="round" />
      <circle cx="127" cy="112" r="38" fill="#020617" opacity=".25" />
      <circle cx="124" cy="106" r="38" fill="url(#pickleball)" />
      <g fill="#365314" opacity=".8">
        <ellipse cx="106" cy="87" rx="5" ry="6" transform="rotate(35 106 87)" /><ellipse cx="129" cy="80" rx="6" ry="4" />
        <ellipse cx="145" cy="97" rx="4" ry="6" transform="rotate(-15 145 97)" /><circle cx="121" cy="103" r="6" />
        <ellipse cx="99" cy="110" rx="4" ry="6" /><ellipse cx="111" cy="128" rx="6" ry="4" transform="rotate(20 111 128)" />
        <ellipse cx="136" cy="123" rx="5" ry="6" transform="rotate(35 136 123)" />
      </g>
      <g stroke="#bef264" strokeWidth="2" strokeLinecap="round"><path d="M395 94V110M387 102H403M66 335V347M60 341H72" /></g>
    </svg>
  );
}
