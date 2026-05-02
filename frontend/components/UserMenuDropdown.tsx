"use client";

import { useState, useRef, useEffect, useCallback, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import {
  UserRound,
  Settings,
  CircleHelp,
  LogOut,
  ChevronsUpDown,
  ShieldCheck,
} from "lucide-react";
import { useTranslation, useI18nStore, type Language } from "@/lib/store/i18nStore";
import { useDraftStore } from "@/lib/store/draftStore";
import { useChatStore } from "@/lib/store/chatStore";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { useTemplatesStore } from "@/lib/store/templatesStore";
import { useUiShellStore } from "@/lib/store/uiShellStore";
import { getErrorMessage } from "@/lib/request";
import { patchProfilePreferences } from "@/lib/profilePreferences";
import { actionToast } from "@/components/ui/action-toast";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeSwitcher, type ThemeOption } from "@/components/ui/theme-switcher";

interface UserMenuDropdownProps {
  triggerVariant?: "avatar" | "sidebar";
  hideNameInMenu?: boolean;
  openDirection?: "down" | "up";
  sidebarOpen?: boolean;
}

export function UserMenuDropdown({
  triggerVariant = "avatar",
  hideNameInMenu = false,
  openDirection = "down",
  sidebarOpen = true,
}: UserMenuDropdownProps = {}) {
  const { t } = useTranslation();
  const { data: session, status } = useSession();
  const language = useI18nStore((s) => s.language);
  const setLanguage = useI18nStore((s) => s.setLanguage);
  const openFeedback = useUiShellStore((s) => s.openFeedback);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const shouldRestoreFocusRef = useRef(true);

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

  const storedDisplayName = useUserLevelStore((s) => s.displayName);
  const user = session?.user;
  const name = user?.name ?? null;
  const email = user?.email ?? null;
  const image = user?.image ?? null;
  const displayName = storedDisplayName || name || email || "User";
  const planLabel = t("user.freePlan");
  const initials = displayName.slice(0, 2).toUpperCase();

  const handleLanguageChange = async (lang: Language) => {
    const previousLanguage = language;
    setLanguage(lang);
    useTemplatesStore.getState().fetchTemplates();

    try {
      await patchProfilePreferences({ language: lang }, email);
    } catch (error) {
      setLanguage(previousLanguage);
      useTemplatesStore.getState().fetchTemplates();
      actionToast.error(getErrorMessage(error, t("menu.preferenceSaveError")));
    }
  };

  const handleThemePersist = useCallback((nextTheme: ThemeOption) => {
    // Fire-and-forget — don't block the switcher UI waiting for the network
    patchProfilePreferences({ theme: nextTheme }, email).catch((error: unknown) => {
      actionToast.error(getErrorMessage(error, t("menu.preferenceSaveError")));
    });
  }, [email, t]);

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
    "w-full justify-start !gap-2 px-3 text-[15px] font-medium text-ds-text hover:bg-gray-alpha-200 hover:text-ds-text shadow-none";
  const sidebarWrapperClass = sidebarOpen
    ? "relative w-full"
    : "relative flex h-10 w-10 items-center justify-center";
  const menuPanel = `absolute z-50 w-64 rounded-2xl border border-gray-alpha-200 bg-background p-2 shadow-geist-lg animate-fade-in ${
    openDirection === "up"
      ? triggerVariant === "sidebar" && !sidebarOpen
        ? "bottom-0 left-[calc(100%+8px)]"
        : "bottom-full left-0 mb-2"
      : "right-0 top-full mt-2"
  }`;

  if (status === "loading" && triggerVariant === "sidebar") {
    return sidebarOpen ? (
      <div className="relative h-12 w-full rounded-xl">
        <div className="absolute left-3 top-1/2 h-8 w-8 -translate-y-1/2 animate-pulse rounded-full bg-gray-alpha-200" />
        <div className="absolute left-14 right-9 top-[calc(50%-9px)] h-3 animate-pulse rounded bg-gray-alpha-200" />
        <div className="absolute left-14 w-16 top-[calc(50%+5px)] h-2 animate-pulse rounded bg-gray-alpha-200/80" />
        <div className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rounded bg-gray-alpha-200/80" />
      </div>
    ) : (
      <div className="h-10 w-10 animate-pulse rounded-full bg-gray-alpha-200" />
    );
  }

  if (!user) return null;

  return (
    <div
      ref={menuRef}
      className={triggerVariant === "sidebar" ? sidebarWrapperClass : "relative"}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={
          triggerVariant === "sidebar"
            ? `text-ds-text flex items-center text-left transition-colors ${
              sidebarOpen
                ? "relative h-12 w-full rounded-xl bg-transparent pl-14 pr-9 appearance-none border-0 hover:bg-gray-alpha-200"
                : "flex h-10 w-10 items-center justify-center rounded-full bg-transparent p-0 appearance-none border-0 hover:bg-gray-alpha-200"
            }`
            : "flex h-8 w-8 items-center justify-center overflow-hidden rounded-full transition-all shadow-[0_0_0_1px_var(--ds-gray-alpha-300)] bg-gray-alpha-100"
        }
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-alpha-100 shadow-[0_0_0_1px_var(--ds-gray-alpha-300)] ${
            triggerVariant === "sidebar" && sidebarOpen
              ? "absolute left-3 top-1/2 -translate-y-1/2"
              : ""
          }`}
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
            <span className={`text-sm font-medium ${triggerVariant === "sidebar" ? "text-ds-text" : "text-ds-text-secondary"}`}>
              {initials}
            </span>
          )}
        </span>

        {triggerVariant === "sidebar" && sidebarOpen && (
          <>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium leading-5 text-ds-text">{displayName}</p>
              <p className="mt-0.5 truncate text-[14px] leading-5 text-ds-text-tertiary">
                {planLabel}
              </p>
            </div>
            <ChevronsUpDown
              size={14}
              strokeWidth={2}
              className="absolute right-3 top-1/2 shrink-0 -translate-y-1/2 text-ds-text"
            />
          </>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          onKeyDown={handleMenuKeyDown}
          className={menuPanel}
        >
          <div className="px-3 py-3">
            {!hideNameInMenu && name && (
              <p className="text-[15px] font-medium text-ds-text">{name}</p>
            )}
            {email && (
              <p className={`truncate text-[14px] text-ds-text-tertiary ${!hideNameInMenu && name ? "mt-0.5" : ""}`}>
                {email}
              </p>
            )}
            {hideNameInMenu && !email && (
              <p className="truncate text-[14px] text-ds-text-tertiary">
                {displayName}
              </p>
            )}
          </div>

          <Separator className="-mx-2 my-1.5 w-auto" />

          <div className="space-y-0.5">
            <Link
              href="/profile"
              data-user-menu-item="true"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={`flex items-center ${menuBtn} rounded-lg h-10`}
            >
              <UserRound
                size={16}
                strokeWidth={2}
                className="shrink-0 text-current"
              />
              <span>{t("menu.profile")}</span>
            </Link>

            <Link
              href="/settings"
              data-user-menu-item="true"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={`flex items-center ${menuBtn} rounded-lg h-10`}
            >
              <Settings
                size={16}
                strokeWidth={2}
                className="shrink-0 text-current"
              />
              <span>{t("menu.accountSettings")}</span>
            </Link>

            {session?.user?.email === "eyexzy@gmail.com" && (
              <Link
                href="/admin"
                data-user-menu-item="true"
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`flex items-center ${menuBtn} rounded-lg h-10`}
              >
                <ShieldCheck
                  size={16}
                  strokeWidth={2}
                  className="shrink-0 text-current"
                />
                <span>{t("menu.adminPanel")}</span>
              </Link>
            )}

            <Button
              type="button"
              variant="tertiary"
              size="sm"
              data-user-menu-item="true"
              role="menuitem"
              className={`${menuBtn} rounded-lg h-10`}
              leftIcon={
                <CircleHelp
                  size={16}
                  strokeWidth={2}
                  className="shrink-0 text-current"
                />
              }
              onClick={() => {
                shouldRestoreFocusRef.current = false;
                setOpen(false);
                openFeedback();
              }}
              >
                {t("menu.feedback")}
              </Button>
          </div>

          <Separator className="-mx-2 my-1.5 w-auto" />

          <div className="px-3 py-1.5">
            <p className="text-[14px] font-medium leading-5 text-ds-text-tertiary">
              {t("menu.preferences")}
            </p>
          </div>

          <div className="flex flex-col gap-0.5 px-0 pb-1">
            <div className="flex h-10 items-center justify-between gap-4 rounded-md px-3">
              <span className="text-[15px] font-medium text-ds-text">
                {t("menu.theme")}
              </span>
              <ThemeSwitcher
                size="small"
                onPersist={handleThemePersist}
              />
            </div>

            <div className="flex h-10 items-center justify-between gap-4 rounded-md px-3">
              <span className="text-[15px] font-medium text-ds-text">
                {t("menu.language")}
              </span>
              <Select
                size="sm"
                align="end"
                dropdownWidthMode="content"
                triggerWidthMode="content"
                value={language}
                onValueChange={(v) => handleLanguageChange(v as Language)}
                options={[
                  { value: "en", label: t("menu.langEnglish") },
                  { value: "uk", label: t("menu.langUkrainian") },
                ]}
                className="h-8 gap-1.5 px-2.5 text-[15px] font-medium [&>svg]:h-3.5 [&>svg]:w-3.5"
              />
            </div>
          </div>

          <Separator className="-mx-2 my-1.5 w-auto" />

          <Button
            type="button"
            variant="tertiary"
            size="sm"
            data-user-menu-item="true"
            role="menuitem"
            className={`${menuBtn} rounded-lg h-10`}
            leftIcon={
              <LogOut
                size={16}
                strokeWidth={2}
                className="shrink-0 text-current"
              />
            }
            onClick={() => {
              useChatStore.getState().clearMessages();
              useUserLevelStore.getState().resetMetrics();
              useDraftStore.getState().clearAll();
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
