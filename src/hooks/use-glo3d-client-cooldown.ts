"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  persistGlo3dCooldownUntil,
  readPersistedGlo3dCooldownUntil,
  resolveGlo3dClientCooldownMs,
} from "@/lib/glo3d-client-cooldown";

type PauseNotice = (title: string, message: string) => void;

export function useGlo3dClientCooldown(showPauseNotice?: PauseNotice) {
  const cooldownUntilRef = useRef(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const until = readPersistedGlo3dCooldownUntil();
    if (until <= Date.now()) return;
    cooldownUntilRef.current = until;
    setCooldownUntil(until);
    setSecondsLeft(Math.ceil((until - Date.now()) / 1000));
  }, []);

  const markCooldown = useCallback((retryAfterMs?: number) => {
    const cooldownMs = resolveGlo3dClientCooldownMs(retryAfterMs);
    const until = Math.max(cooldownUntilRef.current, Date.now() + cooldownMs);
    cooldownUntilRef.current = until;
    persistGlo3dCooldownUntil(until);
    setCooldownUntil(until);
    setSecondsLeft(Math.ceil((until - Date.now()) / 1000));
  }, []);

  const assertAllowed = useCallback((): boolean => {
    return true;
  }, []);

  const isOnCooldown = useCallback((): boolean => {
    return cooldownUntilRef.current > Date.now();
  }, []);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) {
      setSecondsLeft(0);
      persistGlo3dCooldownUntil(0);
      return;
    }
    const tick = () => {
      const remainingMs = cooldownUntilRef.current - Date.now();
      if (remainingMs <= 0) {
        cooldownUntilRef.current = 0;
        setCooldownUntil(0);
        setSecondsLeft(0);
        persistGlo3dCooldownUntil(0);
        return;
      }
      setSecondsLeft(Math.ceil(remainingMs / 1000));
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [cooldownUntil]);

  const cooldownLabel = secondsLeft > 0 ? `${secondsLeft}s` : undefined;

  return {
    cooldownUntilRef,
    secondsLeft,
    cooldownLabel,
    isOnCooldown,
    assertAllowed,
    markCooldown,
  };
}
