// Shared class strings — one visual language across the app.
export const btnPrimary =
  'rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40';
export const btnGhost =
  'rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800';
export const btnDanger =
  'rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950';
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

export function MemberDot({ colour, name }: { colour: string; name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colour }} />
      <span>{name}</span>
    </span>
  );
}
