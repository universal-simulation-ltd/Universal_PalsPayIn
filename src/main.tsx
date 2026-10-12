import React from 'react';
import ReactDOM from 'react-dom/client';
import { UniversalProvider } from '@unisim/sdk';
import App from './App';
import './index.css';

// `product` must exist in THREE places before this ships, or every
// usage_events insert fails silently for signed-in visitors only (the
// Converter/USB bug — events unrecoverable, found months later):
//   1. the Postgres `product_code` enum   (universal-platform migration 0116)
//   2. the SDK's `ProductCode` union      (packages/sdk/src/types.ts)
//   3. `SuiteProductId` + the catalogue   (packages/sdk/src/SuiteSwitcher.tsx)
// Never `as unknown as ProductCode` — if the type fights you, the enum is
// missing a value and the fix is a migration, not a cast.
//
// No accounts (privacy audit 2026-10-12): `noAccounts: true` drops the
// navbar's profile icon and sign-in, and <UsageTracker /> is gone. The SDK user
// count (`presence`: a random install id kept in this browser plus the kind of
// device, every 45 s while the page is open and in view) is set explicitly and
// described in README → Privacy; change both together.
const universalConfig = {
  supabaseUrl: import.meta.env.VITE_PLATFORM_SUPABASE_URL || 'https://rygfxgalojojppxmhddo.supabase.co',
  supabaseAnonKey:
    import.meta.env.VITE_PLATFORM_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5Z2Z4Z2Fsb2pvanBweG1oZGRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NTY4MjUsImV4cCI6MjA5NDMzMjgyNX0.hLy_vt9vY_rdPKF3nL32yAuMCD604E3CH5VM7D7CaNE',
  product: 'palspayin' as const,
  noAccounts: true,
  presence: true,
  cookieDomain: import.meta.env.PROD ? '.unisim.co.uk' : undefined,
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UniversalProvider config={universalConfig}>
      <App />
    </UniversalProvider>
  </React.StrictMode>,
);
