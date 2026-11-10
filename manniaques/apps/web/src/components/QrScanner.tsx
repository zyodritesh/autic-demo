import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

type Props = {
  onScan: (text: string) => void;
  onDenied: () => void;
};

export function QrScanner({ onScan, onDenied }: Props) {
  const [error, setError] = useState('');
  const lastRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });
  const onScanRef = useRef(onScan);
  const onDeniedRef = useRef(onDenied);
  onScanRef.current = onScan;
  onDeniedRef.current = onDenied;

  useEffect(() => {
    const id = 'qr-reader';
    let scanner: Html5Qrcode | null = null;
    let running = false;
    let cancelled = false;

    async function start() {
      try {
        scanner = new Html5Qrcode(id);
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 8, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            const now = Date.now();
            if (
              decoded === lastRef.current.value &&
              now - lastRef.current.at < 2500
            ) {
              return;
            }
            lastRef.current = { value: decoded, at: now };
            onScanRef.current(decoded);
          },
          () => undefined,
        );
        running = true;
      } catch (err) {
        if (cancelled) return;
        setError('Camera unavailable');
        onDeniedRef.current();
        console.warn(err);
      }
    }

    void start();

    return () => {
      cancelled = true;
      const s = scanner;
      if (!s) return;
      const stop = async () => {
        try {
          if (running) {
            await s.stop();
          }
        } catch {
          // ignore stop races when camera never started
        }
        try {
          s.clear();
        } catch {
          // ignore
        }
      };
      void stop();
    };
  }, []);

  return (
    <div>
      <div id="qr-reader" className="scanner-box" />
      {error ? (
        <p className="muted" style={{ marginTop: 8 }}>
          {error}. Use Choose item instead.
        </p>
      ) : (
        <p className="muted" style={{ marginTop: 8 }}>
          Keep scanning — same QR is ignored for 2.5s.
        </p>
      )}
    </div>
  );
}
