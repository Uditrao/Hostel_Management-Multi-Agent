/**
 * BrandLogo.jsx
 * =============
 * CohavenOS Logo Symbol.
 * Renders the clean, transparent icon-only emblem with scalable proportions
 * and crisp rendering across light, dark, and monochromatic surfaces.
 */
import logoSrc from '../../assets/cohaven-logo.png'

export default function BrandLogo({ size = 28, className = '', alt = 'CohavenOS' }) {
  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={logoSrc}
        alt={alt}
        className="w-full h-full object-contain filter drop-shadow-sm select-none"
        draggable={false}
      />
    </div>
  )
}
