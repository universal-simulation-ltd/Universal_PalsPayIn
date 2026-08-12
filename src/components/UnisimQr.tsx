import { useEffect, useRef, useState } from 'react';
import QRCodeStyling from 'qr-code-styling';
import { fitsQr, unisimQrOptions } from '../lib/qrStyle';

/**
 * A QR code in the UNI·SIM house style — warm off-black rounded modules, orange
 * finder eyes, the UNI·SIM mark in the centre — matching Universal QR.
 *
 * Rasterised at QR_RENDER_PX and CSS-scaled down to `size`, so the modules stay
 * sharp on a phone screen — see qrStyle.ts for what that buys and how it was
 * measured. The default size is nearly twice what this app used to show a code
 * at, for the same reason: the thing being scanned is a phone screen held up to
 * another phone, so the width of the plate IS the scanning margin.
 */
export default function UnisimQr({
  value,
  size = 280,
  alt,
  className = '',
}: {
  value: string;
  /** Display width in px, shrinking to fit on a narrow screen. The canvas
   *  behind it is always QR_RENDER_PX regardless. */
  size?: number;
  alt: string;
  className?: string;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!fitsQr(value)) {
      setFailed(true);
      return;
    }
    let alive = true;
    // The mark is ~48 KB of base64. Loading it here keeps it out of the main
    // bundle: nobody who never opens the Share tab pays for it.
    void import('../lib/unisimMark')
      .then(({ UNISIM_MARK }) => {
        const holder = holderRef.current;
        if (!alive || !holder) return;
        const qr = new QRCodeStyling(unisimQrOptions(value, UNISIM_MARK));
        holder.replaceChildren();
        qr.append(holder);
        const canvas = holder.querySelector('canvas');
        if (canvas) {
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.style.display = 'block';
        }
        setFailed(false);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [value]);

  return (
    <div
      // Hidden rather than unmounted when the code can't be drawn. The holder
      // below has to stay in the DOM for its ref to survive: unmounting it means
      // the next value — a shorter link, a group whose history was just folded
      // up — has nowhere to draw itself, and the plate never comes back.
      //
      // Nothing to show beats a broken white box, though. The callers already
      // explain in words when a link is too big to scan, and an empty plate
      // would only contradict them.
      //
      // `w-full` under a max, not a fixed width: on a narrow phone the plate
      // gives way rather than pushing the card off the screen.
      className={`w-full rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 ${
        failed ? 'hidden' : ''
      } ${className}`}
      style={{ maxWidth: size + 24 }}
    >
      <div ref={holderRef} role="img" aria-label={alt} className="leading-[0]" />
    </div>
  );
}
