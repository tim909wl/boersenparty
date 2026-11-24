function reverseBytes(hex: string): string {
  return (hex.match(/.{2}/g) ?? []).reverse().join('');
}

export function normalizeUid(value: string): string {
  const uid = value.replace(/[^0-9a-f]/gi, '').toUpperCase();
  if (![8,14,20].includes(uid.length) || !/^[0-9A-F]+$/.test(uid)) throw new Error('UID must be 4, 7 or 10 bytes of hexadecimal data');
  // Different readers (Web NFC on various phones, the native Android bridge, a laptop's browser)
  // don't agree on byte order for the same physical wristband — some report it big-endian, some
  // little-endian. Canonicalize to whichever byte order sorts first so every device converges on
  // the same identity no matter which order it read the tag in.
  const reversed = reverseBytes(uid);
  return uid <= reversed ? uid : reversed;
}
