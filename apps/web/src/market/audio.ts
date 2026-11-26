import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export type MarketAudioStatus = 'blocked' | 'ready' | 'error';

function audioFailure(error: unknown) {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
  if (name === 'NotAllowedError') return 'Wiedergabe vom Browser blockiert';
  if (name === 'NotSupportedError') return 'MP3 wird von diesem Browser nicht unterstützt';
  return error instanceof Error ? error.message : 'Audio konnte nicht wiedergegeben werden';
}

function mediaFailure(audio: HTMLAudioElement) {
  switch (audio.error?.code) {
    case 1: return 'Laden der Audiodatei wurde abgebrochen';
    case 2: return 'Netzwerkfehler beim Laden der Audiodatei';
    case 3: return 'Audiodatei konnte nicht dekodiert werden';
    case 4: return 'MP3-Datei oder MIME-Type wird nicht unterstützt';
    default: return 'Audiodatei konnte nicht geladen werden';
  }
}

// The elements themselves are rendered by MarketDisplay. Keeping them in the DOM is important on
// older TV browsers: every later event reuses an element that was loaded and unlocked directly by
// the viewer, instead of constructing a new Audio object after the WebSocket/poll event arrives.
export function useMarketAudio(enabled: boolean) {
  const crashRef = useRef<HTMLAudioElement>(null);
  const testRef = useRef<HTMLAudioElement>(null);
  const [status, setStatus] = useState<MarketAudioStatus>('blocked');
  const [message, setMessage] = useState('OK drücken, um Audio freizuschalten');
  const [needsUnlockPrompt, setNeedsUnlockPrompt] = useState(true);
  const statusRef = useRef<MarketAudioStatus>('blocked');
  const unlockingRef = useRef(false), playingRef = useRef<HTMLAudioElement | null>(null);
  const lastEffectAtRef = useRef(0);
  useEffect(() => { statusRef.current = status }, [status]);

  const elements = useCallback(() => [crashRef.current, testRef.current].filter(Boolean) as HTMLAudioElement[], []);
  const stopAll = useCallback(() => {
    for (const audio of elements()) {
      audio.pause();
      try { audio.currentTime = 0 } catch { /* Some TV engines reject seeking before metadata. */ }
    }
    playingRef.current = null;
  }, [elements]);

  useEffect(() => {
    if (!enabled) return;
    const audios = elements();
    const onError = (event: Event) => {
      const audio = event.currentTarget as HTMLAudioElement;
      statusRef.current = 'error';
      setStatus('error');
      setMessage(mediaFailure(audio));
    };
    for (const audio of audios) {
      audio.addEventListener('error', onError);
      // Explicit load starts local preloading but does not make a forbidden autoplay attempt.
      audio.load();
    }
    return () => {
      for (const audio of audios) audio.removeEventListener('error', onError);
      stopAll();
    };
  }, [elements, enabled, stopAll]);

  const start = useCallback((audio: HTMLAudioElement, unlock: boolean) => {
    stopAll();
    playingRef.current = audio;
    audio.volume = 1;
    try { audio.currentTime = 0 } catch { /* play() below still starts at the beginning. */ }
    // Do not move this play() behind a timer or another awaited promise: it must execute in the
    // original OK/click event call stack for Android 14 and Phlox autoplay policy.
    let result: Promise<void> | undefined;
    try { result = audio.play() } catch (error: unknown) {
      playingRef.current = null;
      const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
      const blocked = name === 'NotAllowedError';
      statusRef.current = blocked ? 'blocked' : 'error';
      setStatus(blocked ? 'blocked' : 'error');
      setMessage(audioFailure(error));
      return Promise.resolve(false);
    }
    // play() returned void in a few old HTML5 implementations. If playback did start, treat that
    // as success; modern Android/Chromium returns the standard Promise handled below.
    if (!result) {
      if (unlock) setNeedsUnlockPrompt(false);
      statusRef.current = 'ready'; setStatus('ready'); setMessage('Audio bereit');
      return Promise.resolve(true);
    }
    return result.then(() => {
      statusRef.current = 'ready';
      setStatus('ready');
      if (unlock) setNeedsUnlockPrompt(false);
      setMessage(unlock ? 'Audio bereit · Testton wurde abgespielt' : 'Audio bereit');
      return true;
    }).catch((error: unknown) => {
      playingRef.current = null;
      const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
      const blocked = name === 'NotAllowedError';
      statusRef.current = blocked ? 'blocked' : 'error';
      setStatus(blocked ? 'blocked' : 'error');
      setMessage(audioFailure(error));
      return false;
    });
  }, [stopAll]);

  const unlock = useCallback(async () => {
    if (!enabled || unlockingRef.current) return false;
    const audio = testRef.current;
    if (!audio) {
      statusRef.current = 'error';
      setStatus('error'); setMessage('Audioelement ist noch nicht initialisiert'); return false;
    }
    unlockingRef.current = true;
    const ok = await start(audio, true);
    unlockingRef.current = false;
    return ok;
  }, [enabled, start]);

  const test = useCallback(() => unlock(), [unlock]);
  const playCrash = useCallback(async () => {
    if (!enabled) return false;
    if (statusRef.current !== 'ready') {
      statusRef.current = 'blocked';
      setStatus('blocked'); setMessage('OK drücken, um Audio freizuschalten'); return false;
    }
    const audio = crashRef.current;
    if (!audio) {
      statusRef.current = 'error';
      setStatus('error'); setMessage('Crash-Sound ist nicht initialisiert'); return false;
    }
    // A duplicated transport event must not layer two alarms over one another. Legitimate later
    // crashes still play normally; current playback is stopped before any new sound starts.
    const now = Date.now();
    if (now - lastEffectAtRef.current < 1000) return false;
    lastEffectAtRef.current = now;
    return start(audio, false);
  }, [enabled, start]);

  return { crashRef, testRef, status, message, needsUnlockPrompt, unlock, test, playCrash } satisfies {
    crashRef: RefObject<HTMLAudioElement | null>;
    testRef: RefObject<HTMLAudioElement | null>;
    status: MarketAudioStatus;
    message: string;
    needsUnlockPrompt: boolean;
    unlock: () => Promise<boolean>;
    test: () => Promise<boolean>;
    playCrash: () => Promise<boolean>;
  };
}
