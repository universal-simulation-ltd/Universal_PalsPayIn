// Mirrors public/favicon.svg — the cracked coin.
export default function ProductLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0f172a" />
      <defs>
        <linearGradient id="pp-coin" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff9a1f" />
          <stop offset="1" stopColor="#e05504" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="9.5" fill="url(#pp-coin)" />
      <path d="M16 5.5 13.9 10.2 18 13.8 13.9 18.2 18 21.8 16 26.5" fill="none" stroke="#0f172a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
