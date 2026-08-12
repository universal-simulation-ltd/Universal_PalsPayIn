import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
 *
 * Tapping the plate enlarges it, which is the scanning affordance on a laptop:
 * inline, the code is sized for a card in a column, and a friend leaning over
 * with a phone camera wants the whole screen. Copy and Download hand over the
 * same canvas as a PNG — the full QR_RENDER_PX raster, not the shrunken CSS
 * size — for pasting into the group chat or printing out.
 */
export default function UnisimQr({
  value,
  size = 280,
  alt,
  fileName = 'palspayin-qr',
  className = '',
}: {
  value: string;
  /** Display width in px, shrinking to fit on a narrow screen. The canvas
   *  behind it is always QR_RENDER_PX regardless. */
  size?: number;
  alt: string;
  /** Filename stem for the download, without the extension. */
  fileName?: string;
  className?: string;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  /** The enlarged view holds a PNG snapshot rather than a second live code:
   *  the canvas can only live in one place in the DOM, and it belongs on the
   *  plate that stays behind the overlay. */
  const [enlarged, setEnlarged] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

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

  // The code changing under an open overlay — a sync landing, history folded
  // up — would leave a stale snapshot on screen. Close it instead.
  useEffect(() => setEnlarged(null), [value]);

  // A transient line under the buttons: "Copied", or why copying didn't work.
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2600);
    return () => clearTimeout(t);
  }, [note]);

  const canvasEl = () => holderRef.current?.querySelector('canvas') ?? null;

  /** The rendered code as a PNG blob, straight off the canvas the plate shows. */
  const pngBlob = useCallback(async (): Promise<Blob | null> => {
    const canvas = canvasEl();
    if (!canvas) return null;
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }, []);

  const onCopy = async () => {
    const blob = await pngBlob();
    // Browsers have variously refused image writes outside a narrow
    // user-gesture window. Saying so beats a button that silently does
    // nothing — Download always works.
    if (!blob || typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      setNote('This browser won’t let a page copy an image — use Download instead.');
      return;
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setNote('Copied ✓');
    } catch {
      setNote('This browser blocked the copy — use Download instead.');
    }
  };

  const onDownload = async () => {
    const blob = await pngBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // A tick for the browser to start the download before the URL goes away.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const onEnlarge = () => {
    const canvas = canvasEl();
    if (canvas) setEnlarged(canvas.toDataURL('image/png'));
  };

  return (
    // Hidden rather than unmounted when the code can't be drawn. The holder
    // below has to stay in the DOM for its ref to survive: unmounting it means
    // the next value — a shorter link, a group whose history was just folded
    // up — has nowhere to draw itself, and the plate never comes back.
    //
    // Nothing to show beats a broken white box, though. The callers already
    // explain in words when a link is too big to scan, and an empty plate
    // would only contradict them.
    <div className={`${failed ? 'hidden' : ''} ${className}`}>
      {/* `w-full` under a max, not a fixed width: on a narrow phone the plate
          gives way rather than pushing the card off the screen. */}
      <button
        type="button"
        onClick={onEnlarge}
        aria-label={`${alt}. Activate to enlarge.`}
        className="block w-full rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 transition hover:ring-orange-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:ring-slate-700"
        style={{ maxWidth: size + 24 }}
      >
        <div ref={holderRef} role="img" aria-label={alt} className="leading-[0]" />
      </button>

      <div className="no-print mt-2 flex flex-wrap items-center gap-2" style={{ maxWidth: size + 24 }}>
        <QrAction onClick={onEnlarge}>Enlarge</QrAction>
        <QrAction onClick={() => void onCopy()}>Copy PNG</QrAction>
        <QrAction onClick={() => void onDownload()}>Download PNG</QrAction>
      </div>
      {note && <p className="no-print mt-1 text-xs text-slate-500 dark:text-slate-400">{note}</p>}

      {enlarged && (
        <QrLightbox src={enlarged} alt={alt} note={note} onClose={() => setEnlarged(null)} onCopy={() => void onCopy()} onDownload={() => void onDownload()} />
      )}
    </div>
  );
}

function QrAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      {children}
    </button>
  );
}

/**
 * The enlarged code, as big as the viewport allows. `min(88vw, 72vh)` rather
 * than a pixel size: what matters is that the whole plate is on screen at once,
 * because a code cropped by the bottom of the window is a code that won't scan.
 */
function QrLightbox({
  src,
  alt,
  note,
  onClose,
  onCopy,
  onDownload,
}: {
  src: string;
  alt: string;
  note: string | null;
  onClose: () => void;
  onCopy: () => void;
  onDownload: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      // Above 1000: the SDK navbar sets an inline `zIndex: 1000`, so anything
      // in Tailwind's default scale leaves the bar sitting brightly on top of
      // the dimmed page.
      className="no-print fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      // The backdrop closes; a click that lands on the panel must not bubble
      // up and close it again.
      onClick={onClose}
    >
      <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <img
          src={src}
          alt={alt}
          className="rounded-2xl bg-white p-3 shadow-2xl"
          style={{ width: 'min(88vw, 72vh)', height: 'auto' }}
        />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="rounded-lg bg-white/90 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-white"
          >
            Copy PNG
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="rounded-lg bg-white/90 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-white"
          >
            Download PNG
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/40 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10"
          >
            Close
          </button>
        </div>
        <p className="text-xs text-white/80">{note ?? 'Hold a camera up to this, or press Esc to close.'}</p>
      </div>
    </div>
  );
}
