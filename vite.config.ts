import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// Served at opensource.unisim.co.uk/palspayin/ behind the portal Worker, so
// production assets live under /palspayin/. The PWA makes the SHELL work
// offline — and unlike most of the suite, the whole app genuinely works
// offline too: the ledger is arithmetic in the browser. Only relay sync (an
// explicit, off-by-default feature) needs the network.
export default defineConfig(({ mode }) => {
  const BASE_PATH = mode === 'production' ? '/palspayin/' : '/';
  return {
    base: BASE_PATH,
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: {
      exclude: ['@unisim/sdk'],
      // ⚠️ Dev only, and REQUIRED. The SDK's QR component reaches
      // qr-code-styling through a dynamic import; that package ships UMD with
      // no ESM build, and with @unisim/sdk excluded above Vite serves it raw,
      // where the UMD wrapper dies on "Cannot set properties of undefined
      // (setting 'QRCodeStyling')". The component catches it, so the only
      // symptom is a plate that never draws. Naming it here forces the CJS
      // interop; `vite build` was never affected.
      include: ['qr-code-styling'],
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'unisim-icon.png', 'icon-180.png', 'icon-192.png', 'icon-512.png'],
        manifest: {
          name: 'Universal PalsPayIn',
          short_name: 'PalsPayIn',
          description: 'Split bills with friends. No account, no ads. It never moves money.',
          theme_color: '#0f172a',
          background_color: '#f8fafc',
          display: 'standalone',
          start_url: BASE_PATH,
          scope: BASE_PATH,
          icons: [
            { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: 'unisim-icon.png', sizes: '128x128', type: 'image/png' },
          ],
        },
        workbox: {
          navigateFallback: `${BASE_PATH}index.html`,
          // The relay API must never be cached — a stale sync response is a
          // silent divergence, the exact failure a ledger exists to prevent.
          navigateFallbackDenylist: [/\/api\//],
        },
        devOptions: { enabled: false },
      }),
    ],
  };
});
