// The LingoFlow mark, the same artwork as the Android launcher icon and the logo on the
// Google sign-in consent screen: an "L" whose base flows into a wave, ending in a
// lingonberry dot, on fjord blue.
export function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <svg className="brand-mark" viewBox="18 18 72 72" width={size} height={size} aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="108" height="108" fill="#2D628B" />
      <g
        transform="translate(54 54) scale(0.72) translate(-54 -54)"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="8.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M30 27 V64 q0 9 9 9" />
        <path d="M39 73 q4 -9 8 0 t8 0 t8 0" />
        <circle cx="76" cy="73" r="6.5" fill="#F0607F" stroke="none" />
      </g>
    </svg>
  );
}
