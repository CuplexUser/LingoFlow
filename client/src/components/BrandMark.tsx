// The LingoFlow mark: an "L" whose base flows into a wave, ending in a lingonberry dot. It
// takes the theme's ink, paper and accent so it sits with the wordmark in both light and dark
// mode. favicon.svg, favicon.ico, the static pages (legal.css) and the Cloud Console logo
// (images/lingoflow-logo-120.png) use the same colors; keep them in step when this changes.
export function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <svg className="brand-mark" viewBox="18 18 72 72" width={size} height={size} aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="108" height="108" fill="var(--ink)" />
      <g
        transform="translate(54 54) scale(0.72) translate(-54 -54)"
        fill="none"
        stroke="var(--bg)"
        strokeWidth="8.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M30 27 V64 q0 9 9 9" />
        <path d="M39 73 q4 -9 8 0 t8 0 t8 0" />
        <circle cx="76" cy="73" r="6.5" fill="var(--accent)" stroke="none" />
      </g>
    </svg>
  );
}
