declare global {
  interface Window {
    onNfcUid?: (uid: string) => void;
    NDEFReader?: new () => {
      scan(options?: { signal?: AbortSignal }): Promise<void>;
      onreading: ((e: any) => void) | null;
      onreadingerror: ((e: any) => void) | null;
    };
  }
}

const euroFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
export const euro = (cents: number) => euroFormat.format(cents / 100);
export const toCents = (value: string) => Math.round(Number(value.replace(',', '.')) * 100);

export function feedback(kind: 'scan' | 'success' | 'error') {
  navigator.vibrate?.(kind === 'success' ? [60, 40, 100] : kind === 'error' ? [160, 60, 160] : 60);
}

// A USB reader types the UID like a keyboard and a phone reports it as a colon-separated string;
// both become the same canonical uppercase hex so the server resolves one wallet either way.
// Anything that is not a plausible UID is passed through untouched as a printed Tyvek number.
export function scannerValue(raw: string) {
  const trimmed = raw.trim();
  const hex = trimmed.replace(/[:-]/g, '');
  return /^[0-9a-f]+$/i.test(hex) && [8, 14, 20].includes(hex.length) ? hex.toUpperCase() : trimmed;
}
