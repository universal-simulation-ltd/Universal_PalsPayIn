import { useEffect, useState, type ReactNode } from 'react';
import { QrLightbox, UnisimQr as SdkQr, fitsQr, unisimQrPngBlob } from '@unisim/sdk';

/**
 * A QR code in the UNI·SIM house style, plus the two things this app wants
 * around one: Copy PNG and Download PNG.
 *
 * The code itself, its measurements and the enlarged view all live in
 * `@unisim/sdk` now — this file used to hold the only copy of that arrangement
 * and the notes behind it (`lib/qrStyle.ts`, deleted), which is why the SDK's
 * comments read like PalsPayIn's did. Seven apps drew the same code; they draw
 * this one now.
 *
 * What stays here is what is genuinely PalsPayIn's: a link someone puts in the
 * group chat or prints out, so the code has to leave the screen as a file, and
 * a link that can outgrow a QR entirely, so there is a plate that knows how to
 * not be there.
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
   *  behind it is far larger regardless — see the SDK's unisimQrRenderPx. */
  size?: number;
  alt: string;
  /** Filename stem for the download, without the extension. */
  fileName?: string;
  className?: string;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState(false);

  // The code changing under an open overlay — a sync landing, history folded
  // up — would leave the wrong code on screen. Close it instead.
  useEffect(() => setEnlarged(false), [value]);

  // A transient line under the buttons: "Copied", or why copying didn't work.
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2600);
    return () => clearTimeout(t);
  }, [note]);

  // Nothing to show beats a broken white box. The callers already explain in
  // words when a link is too big to scan, and an empty plate would only
  // contradict them.
  if (!fitsQr(value)) return null;

  const onCopy = async () => {
    // Browsers have variously refused image writes outside a narrow
    // user-gesture window. Saying so beats a button that silently does
    // nothing — Download always works.
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      setNote('This browser won’t let a page copy an image — use Download instead.');
      return;
    }
    try {
      const blob = await unisimQrPngBlob(value);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setNote('Copied ✓');
    } catch {
      setNote('This browser blocked the copy — use Download instead.');
    }
  };

  const onDownload = async () => {
    const blob = await unisimQrPngBlob(value);
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

  return (
    <div className={className}>
      {/* `w-full` under a max, not a fixed width: on a narrow phone the plate
          gives way rather than pushing the card off the screen.

          The plate is this app's own button rather than the SDK's — it carries
          the ring and the dark-mode treatment, and a button inside a button is
          not markup — so the code is inert and the lightbox opens from here. */}
      <button
        type="button"
        onClick={() => setEnlarged(true)}
        aria-label={`${alt}. Activate to enlarge.`}
        className="block w-full rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 transition hover:ring-orange-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:ring-slate-700"
        style={{ maxWidth: size + 24 }}
      >
        <SdkQr
          value={value}
          size={size}
          enlargeable={false}
          label={alt}
          style={{ width: '100%', height: 'auto', aspectRatio: '1 / 1' }}
        />
      </button>

      <div className="no-print mt-2 flex flex-wrap items-center gap-2" style={{ maxWidth: size + 24 }}>
        <QrAction onClick={() => setEnlarged(true)}>Enlarge</QrAction>
        <QrAction onClick={() => void onCopy()}>Copy PNG</QrAction>
        <QrAction onClick={() => void onDownload()}>Download PNG</QrAction>
      </div>
      {note && <p className="no-print mt-1 text-xs text-slate-500 dark:text-slate-400">{note}</p>}

      {enlarged && (
        <QrLightbox
          value={value}
          label={alt}
          title={note ?? 'Hold a camera up to this, or press Esc to close'}
          hint={null}
          actions={
            <>
              <LightboxAction onClick={() => void onCopy()}>Copy PNG</LightboxAction>
              <LightboxAction onClick={() => void onDownload()}>Download PNG</LightboxAction>
            </>
          }
          onClose={() => setEnlarged(false)}
        />
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

/** The same two actions inside the enlarged view, where the ground is dark. */
function LightboxAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg bg-white/90 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-white"
    >
      {children}
    </button>
  );
}
