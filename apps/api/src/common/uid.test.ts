import { describe, expect, it } from 'vitest';
import { normalizeUid, tryNormalizeUid } from './uid.js';
import { DomainError } from './domain-error.js';

describe('normalizeUid', () => {
  it('converges on the same identity whether a reader reports a UID forwards or byte-reversed', () => {
    const forwards = normalizeUid('04A1B2C3D4E5F6');
    const backwards = normalizeUid('F6E5D4C3B2A104');
    expect(backwards).toBe(forwards);
  });

  it('is insensitive to separators and case', () => {
    expect(normalizeUid('04:a1:b2:c3:d4:e5:f6')).toBe(normalizeUid('04A1B2C3D4E5F6'));
  });

  it('rejects a UID that is not 4, 7 or 10 bytes with a client error, not a raw crash', () => {
    expect(() => normalizeUid('AABBCC')).toThrow(DomainError);
    expect(() => normalizeUid('AABBCC')).toThrow(/8, 14 oder 20 Hex/);
  });

  it('tryNormalizeUid returns an empty string instead of throwing for a non-UID value', () => {
    expect(tryNormalizeUid('0001')).toBe('');
    expect(tryNormalizeUid('AABBCC')).toBe('');
    expect(tryNormalizeUid('04A1B2C3D4E5F6')).toBe(normalizeUid('04A1B2C3D4E5F6'));
  });
});
