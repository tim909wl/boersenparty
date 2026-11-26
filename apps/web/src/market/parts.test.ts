import { describe, expect, it } from 'vitest';
import { boardUnit, splitVolume } from './parts';

describe('boardUnit', () => {
  const tv = { handheld: false, perColumn: 600, boardHeight: 800 };

  it('fits a kiosk screen by whichever axis is tighter', () => {
    // Plenty of height: width decides (600/6.6).
    expect(boardUnit({ ...tv, unitsToFit: 4 })).toBeCloseTo(600 / 6.6, 5);
    // Many drinks: height decides, so nothing is pushed off a screen nobody can scroll.
    expect(boardUnit({ ...tv, unitsToFit: 20 })).toBe(40);
  });

  it('never lets a kiosk exceed the readable ceiling', () => {
    expect(boardUnit({ handheld: false, perColumn: 4000, boardHeight: 4000, unitsToFit: 4 })).toBe(130);
  });

  it('ignores height on a handheld, so a long list scrolls instead of shrinking to nothing', () => {
    const short = boardUnit({ handheld: true, perColumn: 342, boardHeight: 300, unitsToFit: 40 });
    const tall = boardUnit({ handheld: true, perColumn: 342, boardHeight: 3000, unitsToFit: 40 });
    expect(short).toBe(tall);
    expect(short).toBeCloseTo(342 / 6.6, 5);
  });

  it('keeps a handheld row readable on a very narrow screen', () => {
    expect(boardUnit({ handheld: true, perColumn: 120, boardHeight: 600, unitsToFit: 10 })).toBe(30);
  });

  it('caps a handheld row so a tablet does not render absurdly large rows', () => {
    expect(boardUnit({ handheld: true, perColumn: 900, boardHeight: 600, unitsToFit: 10 })).toBe(72);
  });
});

// Checked against the real drink catalogue: a trailing volume should be split off and set quietly
// next to the name, but a name that merely ends in a word must never lose its last word.
describe('splitVolume', () => {
  it('splits a trailing volume off the name', () => {
    expect(splitVolume('Helles 0,5 l')).toEqual({ main: 'Helles', suffix: '0,5 l' });
    expect(splitVolume('Radler 0,33l')).toEqual({ main: 'Radler', suffix: '0,33l' });
    expect(splitVolume('Wasser 1 l')).toEqual({ main: 'Wasser', suffix: '1 l' });
  });

  it('leaves names without a volume completely untouched', () => {
    for (const name of ['Cuba Libre', 'Aperol Spritz', 'Gin Wildberry', 'Mexikaner', 'Leitungswasser', 'Wodka Lemon']) {
      expect(splitVolume(name)).toEqual({ main: name, suffix: '' });
    }
  });

  it('does not treat a trailing single letter l word as a volume without digits', () => {
    expect(splitVolume('Bier l')).toEqual({ main: 'Bier l', suffix: '' });
  });
});
