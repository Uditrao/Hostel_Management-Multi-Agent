/**
 * BrandLogo.jsx
 * =============
 * Custom distinctive architectural logo mark for KINESIS / HostelOS.
 * High-contrast geometric isometric monogram built with crisp SVG lines.
 */
export default function BrandLogo({ size = 28, className = '' }) {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        {/* Outer square frame */}
        <rect
          x="1"
          y="1"
          width="30"
          height="30"
          stroke="#404040"
          strokeWidth="1.5"
          fill="#0c0c0c"
        />
        {/* Geometric Monogram H / Facility Matrix */}
        <path
          d="M7 6V26M25 6V26M7 16H25"
          stroke="#FFFFFF"
          strokeWidth="2.5"
          strokeLinecap="square"
        />
        {/* Inner crosshair technical mark */}
        <line x1="16" y1="9" x2="16" y2="13" stroke="#888888" strokeWidth="1.5" />
        <line x1="16" y1="19" x2="16" y2="23" stroke="#888888" strokeWidth="1.5" />
        {/* Corner registration pips */}
        <rect x="3" y="3" width="2" height="2" fill="#FFFFFF" />
        <rect x="27" y="27" width="2" height="2" fill="#FFFFFF" />
      </svg>
    </div>
  )
}
