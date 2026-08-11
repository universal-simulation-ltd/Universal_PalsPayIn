import { useEffect } from 'react';
import { UniversalAppsNavBar } from '@unisim/sdk';
import UsageTracker from './UsageTracker';
import ProductLogo from './components/Header/ProductLogo';
import AppMenu from './components/Header/AppMenu';
import GroupList from './components/GroupList';
import GroupView from './components/GroupView';
import MergeReview from './components/MergeReview';
import { useGroupStore } from './stores/groupStore';

// The single page container. The navbar (via the SDK's `contentClassName`), the
// page body and the footer all share it, so the suite switcher lines up with
// the left edge of the page content — and the profile/changelog cluster with
// its right edge — at every breakpoint.
//
// Without this the navbar falls back to the SDK's standalone default: a fixed
// 1280px row with the profile cluster pinned 12px off the VIEWPORT edge. At
// 1440px that put the bar at 80–1360 over content at 208–1232, overhanging it
// by ~128px on each side. Universal PDF and Images are the pattern this copies.
export const CONTAINER = 'mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8'

const REPO_URL = 'https://github.com/universal-simulation-ltd/Universal_PalsPayIn';

export default function App() {
  const init = useGroupStore((s) => s.init);
  const loaded = useGroupStore((s) => s.loaded);
  const activeId = useGroupStore((s) => s.activeId);
  const importNotice = useGroupStore((s) => s.importNotice);
  const dismissNotice = useGroupStore((s) => s.dismissNotice);
  const pendingSuspicions = useGroupStore((s) => s.pendingSuspicions);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 dark:bg-slate-950">
      <UniversalAppsNavBar
        contentClassName={CONTAINER}
        product="palspayin"
        productLogo={<ProductLogo />}
        productHomeHref={import.meta.env.BASE_URL}
        actions={<AppMenu />}
        suiteSwitcherIconSrc={`${import.meta.env.BASE_URL}unisim-icon.png`}
      />
      <UsageTracker />
      <main className={`${CONTAINER} flex-1 py-8`}>
        {importNotice && (
          <div className="no-print mb-4 flex items-start justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-200">
            <p>{importNotice}</p>
            <button type="button" onClick={dismissNotice} className="font-semibold" aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}
        {pendingSuspicions && <MergeReview pending={pendingSuspicions} />}
        {!loaded ? null : activeId ? <GroupView key={activeId} groupId={activeId} /> : <GroupList />}
      </main>
      <footer className="no-print border-t border-slate-200 bg-white py-4 dark:border-slate-800 dark:bg-slate-900">
        <div className={`${CONTAINER} flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400`}>
          <p>
            A shared-expense ledger. It records what is owed and what people say they sent —{' '}
            <strong className="font-semibold">it never moves money.</strong>
          </p>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-slate-700 dark:hover:text-slate-200">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Open source (MIT)
          </a>
        </div>
      </footer>
    </div>
  );
}
