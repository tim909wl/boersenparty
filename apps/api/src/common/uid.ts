import { DomainError } from './domain-error.js';

function reverseBytes(hex: string): string {
  return (hex.match(/.{2}/g) ?? []).reverse().join('');
}

export function uidVariants(value: string): string[] {
  const uid = /^[0-9a-f:\s-]+$/i.test(value.trim()) ? value.replace(/[:\s-]/g, '').toUpperCase() : '';
  if (![8,14,20].includes(uid.length) || !/^[0-9A-F]+$/.test(uid)) throw new DomainError('INVALID_UID', 'NFC-UID muss 8, 14 oder 20 Hex-Zeichen haben (per Scan erfasst)', 400);
  return [...new Set([uid, reverseBytes(uid)])];
}

// For call sites that accept either the printed Tyvek band number or an NFC UID: returns the
// normalized UID, or '' (a value no real uid_hex column can ever equal) when the input isn't a
// UID at all, so it can be used as a safe second branch in a `band_number=? OR uid_hex=?` query.
export function tryNormalizeUid(value: string): string {
  try { return normalizeUid(value); } catch { return ''; }
}

export function normalizeUid(value: string): string {
  return uidVariants(value).sort()[0];
}
