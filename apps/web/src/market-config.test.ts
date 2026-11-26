import { describe,expect,it } from 'vitest';
import { parseMarketDisplayConfig } from './market-config';

describe('market display URL configuration',()=>{
  it('uses a television-safe 16:9 default',()=>{
    expect(parseMarketDisplayConfig('')).toMatchObject({format:'16x9',categoryColumns:2,scale:1,overscan:2,refreshMs:1000,showCharts:true,showTicker:false,showFocus:true,sound:false});
  });

  it('does not enable audio even via an old link',()=>{expect(parseMarketDisplayConfig('?sound=1').sound).toBe(false)});

  it('gives an ultrawide screen a third drink column, which 16:9 has no room for',()=>{
    expect(parseMarketDisplayConfig('?format=21:9').categoryColumns).toBe(3);
    expect(parseMarketDisplayConfig('?format=16:9&columns=3').categoryColumns).toBe(3);
  });

  it('parses and bounds kiosk parameters',()=>{
    expect(parseMarketDisplayConfig('?format=9:16&columns=99&scale=120&overscan=3&refresh=10&charts=0&ticker=0&focus=0&sound=0&category=Bier')).toEqual({format:'9x16',categoryColumns:6,scale:1.2,overscan:3,refreshMs:10000,showCharts:false,showTicker:false,showFocus:false,sound:false,category:'Bier'});
  });
});
