"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useProjectStore } from "@/lib/store/projectStore";

const APP_ROUTES = ["/chat", "/chats", "/profile", "/settings", "/projects"];
const MAX_PROJECT_ROUTE_PREFETCHES = 12;

export function RoutePrefetcher() {
  const router = useRouter();
  const projects = useProjectStore((s) => s.projects);
  const prefetchedRoutesRef = useRef<Set<string>>(new Set());

  const projectRoutes = useMemo(() => {
    return [...projects]
      .sort((a, b) => {
        if (a.is_favorite !== b.is_favorite) {
          return a.is_favorite ? -1 : 1;
        }
        return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
      })
      .slice(0, MAX_PROJECT_ROUTE_PREFETCHES)
      .map((project) => `/projects/${project.id}`);
  }, [projects]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
    let idleId: number | null = null;

    const prefetchRoutes = () => {
      for (const route of APP_ROUTES) {
        if (!prefetchedRoutesRef.current.has(route)) {
          router.prefetch(route);
          prefetchedRoutesRef.current.add(route);
        }
      }

      for (const route of projectRoutes) {
        if (!prefetchedRoutesRef.current.has(route)) {
          router.prefetch(route);
          prefetchedRoutesRef.current.add(route);
        }
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
  }, [projectRoutes, router]);

  return null;
}
