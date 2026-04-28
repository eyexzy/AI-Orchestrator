"use client";

import { Dispatch, SetStateAction, useEffect, useLayoutEffect, useRef, useState } from "react";
import { readPersistedState, writePersistedState } from "@/lib/persistedState";

interface UsePersistentUiStateOptions<T> {
  validate?: (value: unknown) => value is T;
}

export function usePersistentUiState<T>(
  key: string | null,
  initialValue: T,
  options?: UsePersistentUiStateOptions<T>,
): [T, Dispatch<SetStateAction<T>>] {
  const validate = options?.validate;
  const prevKeyRef = useRef<string | null | undefined>(undefined);

  // SSR-safe: always start with initialValue so server and client first render
  // produce identical HTML — no hydration mismatch. useLayoutEffect below
  // restores persisted state before the browser paints (client-only).
  const [state, setState] = useState<T>(initialValue);
  const hydratedRef = useRef(false);

  useLayoutEffect(() => {
    const keyChanged = key !== prevKeyRef.current;
    prevKeyRef.current = key;

    if (!keyChanged && hydratedRef.current) return;
    hydratedRef.current = true;

    if (!key) {
      setState(initialValue);
      return;
    }

    const persisted = readPersistedState<unknown>(key);
    if (persisted === null) {
      setState(initialValue);
      return;
    }
    if (validate && !validate(persisted)) {
      setState(initialValue);
      return;
    }
    setState(persisted as T);
  }, [initialValue, key, validate]);

  useEffect(() => {
    if (!key || !hydratedRef.current) return;
    writePersistedState(key, state);
  }, [key, state]);

  return [state, setState];
}
