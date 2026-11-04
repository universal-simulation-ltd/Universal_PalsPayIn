import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { buttonClass } from '@unisim/sdk';

// Shared class strings — one visual language across the app.
// Buttons are the suite's key buttons (SDK 0.216, BRANDING.md → Buttons,
// 2026-11-04): main.tsx installs their CSS. Primary is once per view; add
// `u-btn--sm` for the small size, and put an icon in a <Key> as the first child.
export const btnPrimary = buttonClass('primary');
export const btnGhost = buttonClass();
export const btnDanger = buttonClass('danger');
export const btnSoft = buttonClass('soft');
export const btnQuiet = buttonClass('quiet');

/** A key button's icon block, its first child. */
export function Key({ children }: { children: ReactNode }) {
  return (
    <span className="u-btn__key" aria-hidden>
      {children}
    </span>
  );
}

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
export const PlusIcon = () => icon('M12 5v14M5 12h14');
export const CheckIcon = () => icon('M5 12.5l4.5 4.5L19 7.5');
export const BinIcon = () => icon('M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3');
export const UploadIcon = () => icon('M12 16V4M7 9l5-5 5 5M5 20h14');
export const DownloadIcon = () => icon('M12 4v12M7 11l5 5 5-5M5 20h14');
export const btnSmall = 'rounded-md px-2 py-1 text-xs font-medium';
// `min-w-0` on the controls is load-bearing on a phone: without it a field's
// intrinsic width — a date picker's especially — forces its grid or flex track
// wider than the screen. Touch devices also get a 16px font floor, in
// index.css, so focusing a field cannot make iOS zoom the page.
export const inputCls =
  'w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
export const selectCls =
  'min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
export const card = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900';
export const label = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

export const checkboxCls = 'h-4 w-4 shrink-0 accent-orange-600';

export function MemberDot({ colour, name }: { colour: string; name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colour }} />
      <span>{name}</span>
    </span>
  );
}

/**
 * A scroll container that fades at whichever edge has more content behind it.
 * The fade is the affordance: a hard-cut edge on a touch screen reads as the
 * end of the content, and a scrollbar people can only summon by scrolling is
 * no help to someone deciding whether to scroll.
 *
 * Implemented with a mask rather than an overlaid gradient so it works on any
 * background — light, dark, or the tinted panels — without having to know
 * which one it is sitting on.
 */
export function ScrollFade({
  children,
  axis = 'y',
  className = '',
  contentClassName = '',
}: {
  children: ReactNode;
  axis?: 'x' | 'y';
  className?: string;
  contentClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const [pos, size, scrollSize] =
      axis === 'y' ? [el.scrollTop, el.clientHeight, el.scrollHeight] : [el.scrollLeft, el.clientWidth, el.scrollWidth];
    // A pixel of slack: fractional layout sizes otherwise leave a permanent
    // fade at an edge that is already fully scrolled to.
    setEdges({ start: pos > 1, end: pos + size < scrollSize - 1 });
  }, [axis]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    return () => observer.disconnect();
  }, [measure, children]);

  const side = axis === 'y' ? ['top', 'bottom'] : ['left', 'right'];
  const stops = [
    `transparent 0`,
    `#000 ${edges.start ? '2.5rem' : '0'}`,
    `#000 calc(100% - ${edges.end ? '2.5rem' : '0px'})`,
    `transparent 100%`,
  ].join(', ');
  const mask = edges.start || edges.end ? `linear-gradient(to ${side[1]}, ${stops})` : undefined;

  return (
    <div
      ref={ref}
      onScroll={measure}
      className={`${axis === 'y' ? 'overflow-y-auto' : 'overflow-x-auto'} ${className}`}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    >
      <div className={contentClassName}>{children}</div>
    </div>
  );
}

/** A button that copies text and says so, then goes quiet again. */
export function CopyButton({ text, label: idle = 'Copy', className = btnGhost }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => setCopied(true));
      }}
    >
      {copied ? 'Copied ✓' : idle}
    </button>
  );
}
