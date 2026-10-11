import { AdvancedMenu } from '@unisim/sdk'
// Generated — `npm run credits` after any dependency change. Never edit it by
// hand: it is read off the installed tree, so a hand-kept list drifts from the
// lockfile the first time anyone upgrades anything, and a credits list naming a
// package we removed is worse than no list at all.
import credits from '../../generated/credits.json'
import { useGroupStore } from '../../stores/groupStore';

// The per-app rows that slot into <UniversalAppsNavBar />'s `actions` prop —
// ROWS ONLY, no trigger and no panel of its own. Inline styles match the SDK
// dropdown's own row rhythm (8px/14px, 13px labels); these render inside SDK
// chrome, not ours.
//
// No Appearance rows (Light / Dark / Match my device) here: the colour scheme
// lives only in Tune this app, whose Colour scheme row is bound to this app's
// theme store (App.tsx passes `themeStore` to the navbar). Don't add them back
// — two controls for one setting, as Universal Compress found.

const TINT = { bg: '#fff7ed', fg: '#c2410c' };
const REST_COLOR = '#374151';

export default function AppMenu() {
  const open = useGroupStore((s) => s.open);
  const activeId = useGroupStore((s) => s.activeId);

  return (
    <>
      <MenuLabel>Groups</MenuLabel>
      <MenuRow glyph="👥" label="All groups" onClick={() => open(null)} disabled={activeId === null} />

      {/* Advanced — the SDK's own category, so every app in the suite has one in
          the same place, and whatever goes in it next is one change rather than
          nineteen. "About this app" is always its last row. */}
      <AdvancedMenu
        about={{
          repo:    'https://github.com/universal-simulation-ltd/Universal_PalsPayIn',
          subject: 'Your ledger',
          except:  'sharing it through the end-to-end encrypted relay',
          headline: 'Other bill splitters keep your spending on their servers, tied to an account.',
          version: __APP_VERSION__,
          credits,
          noticesHref: 'https://github.com/universal-simulation-ltd/Universal_PalsPayIn/blob/main/THIRD-PARTY-NOTICES.md',
        }}
      />
    </>
  );
}

function MenuLabel({ children }: { children: string }) {
  return (
    <div
      style={{
        padding: '8px 14px 4px',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: '#9ca3af',
      }}
    >
      {children}
    </div>
  );
}

function MenuRow({
  glyph,
  label,
  onClick,
  disabled = false,
}: {
  glyph: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '8px 14px',
        fontSize: 13,
        fontFamily: 'inherit',
        textAlign: 'left',
        border: 0,
        background: 'transparent',
        color: disabled ? '#9ca3af' : REST_COLOR,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'background 120ms, color 120ms',
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = TINT.bg;
        e.currentTarget.style.color = TINT.fg;
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = REST_COLOR;
      }}
    >
      <span aria-hidden>{glyph}</span>
      <span style={{ flex: 1, minWidth: 0, fontWeight: 500, lineHeight: 1.3 }}>{label}</span>
    </button>
  );
}
