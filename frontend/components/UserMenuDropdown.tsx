"use client";

import { useState, useRef, useEffect, useCallback, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
import {
  Settings,
  MessageSquare,
  LogOut,
  Monitor,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslation, useI18nStore, type Language } from "@/lib/store/i18nStore";
import { useChatStore } from "@/lib/store/chatStore";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { useTemplatesStore } from "@/lib/store/templatesStore";
import { getErrorMessage } from "@/lib/request";
import { patchProfilePreferences } from "@/lib/profilePreferences";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

/* Theme toggle group (Monitor / Sun / Moon) */
function ThemeToggle({
  onThemeSelect,
}: {
  onThemeSelect: (value: "system" | "light" | "dark", previousTheme: string) => void;
}) {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const options = [
    { value: "system", icon: Monitor },
    { value: "light", icon: Sun },
    { value: "dark", icon: Moon },
  ] as const;

  const current = mounted ? (theme ?? "system") : "system";

  return (
    <div className="inline-flex rounded-lg border border-gray-alpha-200 bg-gray-100 p-0.5">
      {options.map(({ value, icon: Icon }) => (
        <Button
          key={value}
          type="button"
          variant="tertiary"
          size="sm"
          iconOnly
          data-user-menu-item="true"
          role="menuitem"
          leftIcon={<Icon size={14} strokeWidth={2} />}
          onClick={() => onThemeSelect(value, current)}
          className={`h-7 w-8 rounded-md p-0 ${
            current === value
              ? "bg-background text-ds-text shadow-sm"
              : "text-ds-text-tertiary hover:text-ds-text-secondary hover:bg-gray-alpha-200"
          }`}
          aria-label={value}
        >
        </Button>
      ))}
    </div>
  );
}

/* Main dropdown */
export function UserMenuDropdown({
  onOpenAccountSettings,
  onOpenFeedback,
}: {
  onOpenAccountSettings?: () => void;
  onOpenFeedback?: () => void;
}) {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const { setTheme } = useTheme();
  const language = useI18nStore((s) => s.language);
  const setLanguage = useI18nStore((s) => s.setLanguage);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const shouldRestoreFocusRef = useRef(true);

  /* Close on outside click */
  const handleClickOutside = useCallback((e: MouseEvent) => {
    const target = e.target as Node;
    const clickedInsideSelectPortal =
      target instanceof Element && !!target.closest('[data-select-portal="true"]');

    if (
      menuRef.current &&
      !menuRef.current.contains(target) &&
      !clickedInsideSelectPortal
    ) {
      setOpen(false);
    }
  }, []);

  const getMenuItems = useCallback(() => {
    if (!panelRef.current) return [];
    return Array.from(
      panelRef.current.querySelectorAll<HTMLElement>('[data-user-menu-item="true"]:not([disabled])'),
    );
  }, []);

  const focusMenuItem = useCallback((index: number) => {
    const items = getMenuItems();
    if (items.length === 0) return;
    const boundedIndex = ((index % items.length) + items.length) % items.length;
    items[boundedIndex]?.focus();
  }, [getMenuItems]);

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open, handleClickOutside]);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      const rafId = window.requestAnimationFrame(() => focusMenuItem(0));
      return () => window.cancelAnimationFrame(rafId);
    }

    if (wasOpenRef.current) {
      if (shouldRestoreFocusRef.current) {
        triggerRef.current?.focus();
      }
      shouldRestoreFocusRef.current = true;
      wasOpenRef.current = false;
    }
  }, [focusMenuItem, open]);
  const user = session?.user;
  const name = user?.name ?? null;
  const email = user?.email ?? null;
  const image = user?.image ?? null;
  const displayName = name || email || "User";
  const initials = displayName.slice(0, 2).toUpperCase();

  const handleLanguageChange = async (lang: Language) => {
    const previousLanguage = language;
    setLanguage(lang);
    useTemplatesStore.getState().fetchTemplates();

    try {
      await patchProfilePreferences({ language: lang });
    } catch (error) {
      setLanguage(previousLanguage);
      useTemplatesStore.getState().fetchTemplates();
      toast.error(getErrorMessage(error, t("menu.preferenceSaveError")));
    }
  };

  const handleThemeChange = useCallback(async (
    nextTheme: "system" | "light" | "dark",
    previousTheme: string,
  ) => {
    document.documentElement.classList.add("theme-transitioning");
    setTheme(nextTheme);

    try {
      await patchProfilePreferences({ theme: nextTheme });
    } catch (error) {
      const fallbackTheme =
        previousTheme === "light" || previousTheme === "dark" || previousTheme === "system"
          ? previousTheme
          : "system";
      setTheme(fallbackTheme);
      toast.error(getErrorMessage(error, t("menu.preferenceSaveError")));
    } finally {
      window.setTimeout(() => {
        document.documentElement.classList.remove("theme-transitioning");
      }, 50);
    }
  }, [setTheme, t]);

  const handleMenuKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = getMenuItems();
    if (items.length === 0) return;

    const currentIndex = items.findIndex((item) => item === document.activeElement);

    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusMenuItem(currentIndex === -1 ? 0 : currentIndex + 1);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      focusMenuItem(currentIndex === -1 ? items.length - 1 : currentIndex - 1);
      return;
    }

    if (e.key === "Home") {
      e.preventDefault();
      focusMenuItem(0);
      return;
    }

    if (e.key === "End") {
      e.preventDefault();
      focusMenuItem(items.length - 1);
    }
  }, [focusMenuItem, getMenuItems]);

  const menuBtn =
    "w-full justify-start gap-2.5 px-3 text-[14px] text-ds-text-secondary hover:bg-gray-alpha-200 hover:text-ds-text shadow-none";
  const menuPanel =
    "absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-gray-alpha-200 bg-background p-1.5 shadow-geist-lg animate-fade-in";

  if (!user) return null;

  return (
    <div ref={menuRef} className="relative">
      {/* Avatar trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full transition-all shadow-[0_0_0_1px_var(--ds-gray-alpha-300)] bg-gray-alpha-100"
      >
        {image ? (
          <Image
            src={image}
            alt={displayName}
            width={32}
            height={32}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-sm font-medium text-ds-text-secondary">
            {initials}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          role="menu"
          onKeyDown={handleMenuKeyDown}
          className={menuPanel}
        >
          {/* Email section */}
          <div className="px-3 py-2.5">
            {name && (
              <p className="text-[14px] font-medium text-ds-text">{name}</p>
            )}
            {email && (
              <p className="text-[13px] text-ds-text-tertiary mt-0.5 truncate">
                {email}
              </p>
            )}
          </div>

          <Separator className="-mx-1.5 my-1 w-auto" />

          <div className="space-y-0.5">
            {/* Account Settings */}
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              data-user-menu-item="true"
              role="menuitem"
              className={menuBtn}
              leftIcon={<Settings size={16} strokeWidth={2} className="shrink-0 opacity-60" />}
              onClick={() => {
                shouldRestoreFocusRef.current = false;
                setOpen(false);
                onOpenAccountSettings?.();
              }}
            >
              {t("menu.accountSettings")}
            </Button>

            {/* Feedback */}
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              data-user-menu-item="true"
              role="menuitem"
              className={menuBtn}
              leftIcon={<MessageSquare size={16} strokeWidth={2} className="shrink-0 opacity-60" />}
              onClick={() => {
                shouldRestoreFocusRef.current = false;
                setOpen(false);
                onOpenFeedback?.();
              }}
            >
              {t("menu.feedback")}
            </Button>
          </div>

          {/* Preferences section */}
          <div className="px-3 pt-2 pb-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ds-text-tertiary">
              {t("menu.preferences")}
            </p>
          </div>

          {/* Theme row */}
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[14px] text-ds-text-secondary">
              {t("menu.theme")}
            </span>
            <ThemeToggle onThemeSelect={handleThemeChange} />
          </div>

          {/* Language row */}
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[14px] text-ds-text-secondary">
              {t("menu.language")}
            </span>
            <div className="w-[120px]">
              <Select
                size="sm"
                align="end"
                dropdownWidthMode="content"
                value={language}
                onValueChange={(v) => handleLanguageChange(v as Language)}
                options={[
                  { value: "en", label: t("menu.langEnglish") },
                  { value: "uk", label: t("menu.langUkrainian") },
                ]}
              />
            </div>
          </div>

          <Separator className="-mx-1.5 my-1 w-auto" />

          {/* Sign Out */}
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            data-user-menu-item="true"
            role="menuitem"
            className={menuBtn}
            leftIcon={<LogOut size={16} strokeWidth={2} className="shrink-0 opacity-60" />}
            onClick={() => {
              useChatStore.getState().clearMessages();
              useUserLevelStore.getState().resetMetrics();
              signOut({ callbackUrl: "/login" });
            }}
          >
            {t("menu.signOut")}
          </Button>
        </div>
      )}
    </div>
  );
}
