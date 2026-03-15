import { create } from "zustand";
import { toast } from "sonner";
import { getDefaultFavoriteVirtualIds, getVirtualTemplates } from "@/lib/defaultTemplates";
import { useUserLevelStore, type UserLevel } from "@/lib/store/userLevelStore";
import { useI18nStore, type Language } from "@/lib/store/i18nStore";

export interface PromptTemplate {
  id: string;
  title: string;
  description: string;
  category_name: string;
  category_color: string;
  prompt: string;
  system_message: string;
  variables: string[];
  is_favorite: boolean;
  order_index: number;
  created_at: string | null;
}

export function isVirtualTemplate(id: string): boolean {
  return id.startsWith("default-");
}

export function getMergedTemplates(
  custom: PromptTemplate[],
  level: UserLevel,
  lang: Language,
  hiddenTemplates: string[],
): PromptTemplate[] {
  const MAX_FAVORITES = 5;

  // Step 1: Get all virtual templates for the current level/lang.
  const virtuals = getVirtualTemplates(level as 1 | 2 | 3, lang);

  // Step 2: Filter out hidden virtual templates.
  const hidden = new Set(hiddenTemplates);
  const visibleVirtuals = virtuals.filter((v) => !hidden.has(v.id));

  // Step 3: Combine with custom templates, preserving dynamic virtual text.
  const dbMap = new Map(custom.map((t) => [t.id, t]));
  const mergedMap = new Map<string, PromptTemplate>();

  for (const v of visibleVirtuals) {
    const dbCopy = dbMap.get(v.id);
    if (dbCopy) {
      mergedMap.set(v.id, {
        ...v,
        is_favorite: dbCopy.is_favorite,
        order_index: dbCopy.order_index,
      });
    } else {
      mergedMap.set(v.id, v);
    }
  }

  for (const c of custom) {
    if (!mergedMap.has(c.id)) {
      mergedMap.set(c.id, c);
    }
  }

  const combined = Array.from(mergedMap.values()).sort(
    (a, b) => a.order_index - b.order_index,
  );

  // Step 4: Resolve favorites with a strict MAX_FAVORITES priority queue.
  const explicitTrueIds = new Set<string>();
  const explicitFalseIds = new Set<string>();
  for (const t of custom) {
    if (t.is_favorite) explicitTrueIds.add(t.id);
    else explicitFalseIds.add(t.id);
  }

  const favoriteIds = new Set<string>();

  // Priority 1: Explicit DB favorites (absolute priority).
  for (const t of combined) {
    if (favoriteIds.size >= MAX_FAVORITES) break;
    if (explicitTrueIds.has(t.id)) {
      favoriteIds.add(t.id);
    }
  }

  // Priority 2: L3 built-in defaults (only for L3 users), unless explicitly unset in DB.
  if (favoriteIds.size < MAX_FAVORITES && level === 3) {
    const l3DefaultIds = getDefaultFavoriteVirtualIds(level as 1 | 2 | 3, 3);
    for (const id of l3DefaultIds) {
      if (favoriteIds.size >= MAX_FAVORITES) break;
      if (explicitFalseIds.has(id)) continue;
      if (mergedMap.has(id)) favoriteIds.add(id);
    }
  }

  // Priority 3: L2 built-in defaults, unless explicitly unset in DB.
  if (favoriteIds.size < MAX_FAVORITES) {
    const l2DefaultIds = getDefaultFavoriteVirtualIds(level as 1 | 2 | 3, 2);
    for (const id of l2DefaultIds) {
      if (favoriteIds.size >= MAX_FAVORITES) break;
      if (explicitFalseIds.has(id)) continue;
      if (mergedMap.has(id)) favoriteIds.add(id);
    }
  }

  // Step 5: Force all non-top-5 templates to is_favorite=false.
  const resolved = combined.map((t) => ({
    ...t,
    is_favorite: favoriteIds.has(t.id),
  }));

  // Step 6: Sort final array by order_index.
  return resolved.sort((a, b) => a.order_index - b.order_index);
}

interface TemplatesState {
  templates: PromptTemplate[];
  isLoading: boolean;
  fetchTemplates: () => Promise<void>;
  createTemplate: (
    data: Omit<PromptTemplate, "id" | "created_at">,
  ) => Promise<PromptTemplate | null>;
  updateTemplate: (
    id: string,
    data: Partial<Omit<PromptTemplate, "id" | "created_at">>,
  ) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  reorderTemplates: (
    items: { id: string; order_index: number }[],
  ) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
}

export const useTemplatesStore = create<TemplatesState>((set, get) => ({
  templates: [],
  isLoading: false,

  fetchTemplates: async () => {
    if (get().isLoading) return;
    set({ isLoading: true });
    try {
      const res = await fetch("/api/templates", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PromptTemplate[] = await res.json();
      set({ templates: data });
    } catch {
      toast.error("Failed to load templates");
    } finally {
      set({ isLoading: false });
    }
  },

  createTemplate: async (data) => {
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created: PromptTemplate = await res.json();
      set({ templates: [...get().templates, created] });
      return created;
    } catch {
      toast.error("Failed to create template");
      return null;
    }
  },

  updateTemplate: async (id, data) => {
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: PromptTemplate = await res.json();
      set({
        templates: get().templates.map((t) => (t.id === id ? updated : t)),
      });
    } catch {
      toast.error("Failed to update template");
    }
  },

  deleteTemplate: async (id) => {
    try {
      const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      set({ templates: get().templates.filter((t) => t.id !== id) });
    } catch {
      toast.error("Failed to delete template");
    }
  },

  reorderTemplates: async (items) => {
    const prev = get().templates;
    const orderMap = new Map(items.map((i) => [i.id, i.order_index]));
    const { level, hiddenTemplates } = useUserLevelStore.getState();
    const lang = useI18nStore.getState().language;
    let nextCustom = [...prev];

    try {
      // Auto-fork virtual templates that were reordered but not yet persisted in DB.
      const existingIds = new Set(nextCustom.map((t) => t.id));
      const merged = getMergedTemplates(
        nextCustom,
        level as UserLevel,
        lang,
        hiddenTemplates,
      );
      const mergedMap = new Map(merged.map((t) => [t.id, t]));

      for (const { id } of items) {
        if (!isVirtualTemplate(id) || existingIds.has(id)) continue;
        const source = mergedMap.get(id);
        if (!source) continue;

        const createRes = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: source.id,
            title: source.title,
            description: source.description,
            category_name: source.category_name,
            category_color: source.category_color,
            prompt: source.prompt,
            system_message: source.system_message,
            variables: source.variables,
            is_favorite: source.is_favorite,
            order_index: orderMap.get(source.id) ?? source.order_index,
          }),
        });
        if (!createRes.ok) throw new Error(`HTTP ${createRes.status}`);
        const created: PromptTemplate = await createRes.json();
        nextCustom.push(created);
        existingIds.add(created.id);
      }

      // Optimistic order update after ensuring all reordered templates exist in DB.
      nextCustom = nextCustom
        .map((t) =>
          orderMap.has(t.id) ? { ...t, order_index: orderMap.get(t.id)! } : t,
        )
        .sort((a, b) => a.order_index - b.order_index);
      set({ templates: nextCustom });

      const res = await fetch("/api/templates/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      // Rollback on failure
      set({ templates: prev });
      toast.error("Failed to reorder templates");
    }
  },

  toggleFavorite: async (id) => {
    const { level, hiddenTemplates } = useUserLevelStore.getState();
    const lang = useI18nStore.getState().language;
    const customTemplates = get().templates;

    const activeTemplates = getMergedTemplates(
      customTemplates,
      level as UserLevel,
      lang,
      hiddenTemplates,
    );
    const target = activeTemplates.find((t) => t.id === id);
    if (!target) return;

    const willBeFavorite = !target.is_favorite;

    // STRICT SYNCHRONOUS LIMIT CHECK
    if (willBeFavorite) {
      const currentFavCount = activeTemplates.filter((t) => t.is_favorite).length;
      if (currentFavCount >= 5) {
        toast.error(
          lang === "uk"
            ? "Можна закріпити до 5 шаблонів"
            : "You can only pin up to 5 templates",
        );
        return; // Block execution
      }
    }

    const existsInDb = customTemplates.some((t) => t.id === id);
    let newCustom = [...customTemplates];

    // Optimistically update
    if (existsInDb) {
      newCustom = newCustom.map((t) =>
        t.id === id ? { ...t, is_favorite: willBeFavorite } : t,
      );
    } else {
      newCustom.push({ ...target, is_favorite: willBeFavorite });
    }
    set({ templates: newCustom });

    try {
      if (existsInDb) {
        const res = await fetch(`/api/templates/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_favorite: willBeFavorite }),
        });
        if (!res.ok) throw new Error();
        const updated = await res.json();
        set({ templates: get().templates.map((t) => (t.id === id ? updated : t)) });
      } else {
        // Create in DB explicitly with the "default-xxx" ID to preserve dynamic translation!
        const payload = {
          id: target.id,
          title: target.title,
          description: target.description,
          category_name: target.category_name,
          category_color: target.category_color,
          prompt: target.prompt,
          system_message: target.system_message,
          variables: target.variables,
          is_favorite: willBeFavorite,
          // Preserve current visual order to avoid "jump to bottom".
          order_index: target.order_index,
        };
        const res = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
        const created = await res.json();
        set({ templates: [...customTemplates, created] });
      }
    } catch {
      set({ templates: customTemplates }); // Rollback
      toast.error("Failed to update favorite");
    }
  },
}));