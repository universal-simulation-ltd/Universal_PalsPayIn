// GENERATED FILE — do not edit by hand.
// Source: backoffice/universal-platform/scripts/app-marks/marks.mjs
// Regenerate: node scripts/app-marks/build.mjs (from backoffice/universal-platform)
// Mark: Universal PalsPayIn — A coin cracked in two — a bill split, never money moved.
// Hover: The two halves come apart along the crack.
//
// Icon-only by design: the SDK's UniversalAppsNavBar renders the product name
// from its catalogue beside this slot, so a wordmark here would print it twice.

const CSS = `
  /* Resting states */
  .uam-palspayin-halfL { transform: translateX(0); transition: transform .45s cubic-bezier(0.16,1,0.3,1); }
  .uam-palspayin-halfR { transform: translateX(0); transition: transform .45s cubic-bezier(0.16,1,0.3,1); }

  /* Active states */
  .uam-host-palspayin:hover .uam-palspayin-halfL,
  .uam-host-palspayin:focus-visible .uam-palspayin-halfL { transform: translateX(-2.5px); }
  .uam-host-palspayin:hover .uam-palspayin-halfR,
  .uam-host-palspayin:focus-visible .uam-palspayin-halfR { transform: translateX(2.5px); }

  @media (prefers-reduced-motion: reduce) {
    .uam-palspayin-halfL,
    .uam-palspayin-halfR { transition: none !important; }
  }
`

export default function ProductLogo() {
  return (
    <span
      className="uam-host-palspayin inline-flex h-6 w-6 shrink-0 items-center justify-center"
      aria-hidden="true"
    >
      <style>{CSS}</style>
      <svg viewBox="0 0 64 64" className="h-6 w-6" aria-hidden="true">
        <defs>
          <linearGradient id="uam-nav-palspayin-tile" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fe8c01" />
            <stop offset="1" stopColor="#e05504" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="14" fill="url(#uam-nav-palspayin-tile)" />
        <path d="M32 11 L27.8 20.4 L36 27.6 L27.8 36.4 L36 43.6 L32 53 A21 21 0 0 1 32 11 Z" fill="#ffffff" className="uam-palspayin-halfL" />
        <path d="M32 11 L27.8 20.4 L36 27.6 L27.8 36.4 L36 43.6 L32 53 A21 21 0 0 0 32 11 Z" opacity={0.55} fill="#ffffff" className="uam-palspayin-halfR" />
      </svg>
    </span>
  )
}
