import type { Options as QrOptions } from 'qr-code-styling';

/**
 * The UNI·SIM house QR style, as designed and measured in Universal QR
 * (universal-simulation-ltd/Universal_QR, src/lib/qr.ts). Every code this app
 * draws — the share link, the sync join link — uses it, so a PalsPayIn code and
 * a code from the generator are recognisably the same object.
 *
 * The colours are not a free choice, and the reasoning is worth keeping close to
 * the values. Universal QR shipped brand orange (#fe8c01) modules and found by
 * decoding its own output that they do not read: orange sits at 2.3:1 against
 * white, under the ~3:1 floor a decoder needs, and light-on-dark is an inverted
 * code that strict readers refuse outright. So the brand arrives another way —
 * near-black modules carry the data, and the orange goes on the three finder
 * eyes, where it is seen but never asked to be legible at 1px.
 *
 * Warm off-black (#1c1917) rather than the slate-900 used elsewhere in this app:
 * slate is blue-leaning and pulls against the orange, a warm neutral of the same
 * depth shares its hue family. 17.5:1 on white, so it costs nothing.
 */
export const QR_FG = '#1c1917';
export const QR_BG = '#ffffff';
/** Orange 600, not Orange 500 — the deeper of the canonical pair clears 3:1. */
export const QR_EYE = '#e05504';

/**
 * Canvas pixels every code is rasterised at, independent of its display size.
 *
 * Deliberately far larger than any code is shown at, because the failure this
 * number prevents is not obvious from reading the code. A share link near its
 * ceiling is a 161-module QR; displayed at 280 CSS px on a 3× phone that is 912
 * device pixels, and a canvas smaller than that gets UPSCALED by the browser.
 * Bilinear upscaling smears every module edge, and a smeared module is exactly
 * what a decoder's binariser cannot call.
 *
 * Measured, not guessed. Codes were rendered through this pipeline in headless
 * Chromium at deviceScaleFactor 1/2/3, screenshotted (so the browser's own
 * scaling is what is under test, not a resample of our invention) and decoded
 * with jsQR, at payloads of 143/300/600/800/1000 characters:
 *
 *   640 px canvas  — everything above 300 characters failed at every DPR
 *   1024 px canvas — 800 and 1000 characters failed at 3×
 *   1280 px canvas — every payload decodes at 2× and 3×
 *
 * SVG output was tried as the obvious way to dodge raster scaling entirely and
 * is measurably WORSE: vector modules anti-alias their edges to grey at these
 * display sizes, and 600 characters up failed at every DPR.
 */
export const QR_RENDER_PX = 1280;

/**
 * Bytes a QR can carry at error-correction level H (version 40, byte mode).
 *
 * Level H is not a preference: a centre logo covers modules, and only H's ~30%
 * correction budget absorbs that. The price is capacity — H holds 1273 bytes
 * where M holds 2331 — which is why this number lives next to the style rather
 * than inside it. `linkSizeVerdict` in codec.ts only offers a QR below 1000
 * characters, comfortably under this, but a caller that skips that check needs
 * somewhere to look.
 */
export const QR_MAX_BYTES = 1273;

/** True when `data` fits a level-H code at all. UTF-8 bytes, not characters — a
 *  group named in Greek or with emoji costs more than its length suggests. */
export function fitsQr(data: string): boolean {
  return new TextEncoder().encode(data).length <= QR_MAX_BYTES;
}

/**
 * qr-code-styling options for a code in the house style.
 *
 * The mark is passed in rather than imported so this module stays free of the
 * ~48 KB data URI: the component loads that on demand.
 */
export function unisimQrOptions(data: string, mark: string): QrOptions {
  return {
    type: 'canvas',
    width: QR_RENDER_PX,
    height: QR_RENDER_PX,
    // A quiet zone is part of the spec, not decoration — a code butted against
    // the edge of its card is a code some readers will not find.
    margin: Math.round(QR_RENDER_PX * 0.025),
    data,
    image: mark,
    qrOptions: { errorCorrectionLevel: 'H' },
    imageOptions: {
      // Clear the modules behind the mark rather than letting it sit on top of
      // them: a half-covered module is ambiguous, a missing one is just erasure,
      // and erasure is exactly what level H is budgeted for.
      hideBackgroundDots: true,
      imageSize: 0.28,
      margin: Math.round(QR_RENDER_PX * 0.012),
      crossOrigin: 'anonymous',
    },
    dotsOptions: { type: 'rounded', color: QR_FG },
    cornersSquareOptions: { type: 'extra-rounded', color: QR_EYE },
    cornersDotOptions: { type: 'dot', color: QR_EYE },
    backgroundOptions: { color: QR_BG },
  };
}
