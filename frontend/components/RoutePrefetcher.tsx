"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const APP_ROUTES = ["/chat", "/chats", "/dashboard", "/settings", "/projects"];

export function RoutePrefetcher() {
  const router = useRouter();

  useEffect(() => {
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
    let idleId: number | null = null;

    const prefetchRoutes = () => {
      for (const route of APP_ROUTES) {
        router.prefetch(route);
      }
    };

    if (typeof requestIdleCallback === "function") {
      idleId = requestIdleCallback(prefetchRoutes, { timeout: 1500 });
    } else {
      timeoutId = globalThis.setTimeout(prefetchRoutes, 400);
    }

    return () => {
      if (idleId !== null && typeof cancelIdleCallback === "function") {
        cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
    };
  }, [router]);

  return null;
}