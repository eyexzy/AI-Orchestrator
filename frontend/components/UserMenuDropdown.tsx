"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
import {
  User,
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
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

/* Persist preference to backend */
async function patchPreferences(body: Record<string, string>) {
  try {
    await fetch("/api/profile/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
  }
}

/* Theme toggle group (Monitor / Sun / Moon) */
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const options = [
    { value: "system", icon: Monitor },
    { value: "light", icon: Sun },
    { value: "dark", icon: Moon },
  ] as const;

  const current = mounted ? theme : "system";

  return (
    <div className="inline-flex rounded-lg border border-gray-alpha-200 bg-gray-100 p-0.5">
      {options.map(({ value, icon: Icon }) => (
        <Button
          key={value}
          type="button"
          variant="tertiary"
          size="sm"
          iconOnly
          leftIcon={<Icon size={14} strokeWidth={2} />}
          onClick={() => {
            document.documentElement.classList.add("theme-transitioning");
            setTheme(value);
            patchPreferences({ theme: value });
            setTimeout(() => {
              document.documentElement.classList.remove("theme-transitioning");
            }, 50);
          }}
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
  const language = useI18nStore((s) => s.language);
  const setLanguage = useI18nStore((s) => s.setLanguage);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open, handleClickOutside]);

  if (!session?.user) return null;

  const { name, email, image } = session.user;
  const displayName = name || email || "User";
  const initials = displayName.slice(0, 2).toUpperCase();

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    patchPreferences({ language: lang });
    useTemplatesStore.getState().fetchTemplates();
  };

  const menuBtn =
    "w-full justify-start gap-2.5 px-3 text-[14px] text-ds-text-secondary hover:bg-gray-alpha-200 hover:text-ds-text shadow-none";

  return (
    <div ref={menuRef} className="relative">
      {/* Avatar trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
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
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl p-1.5 shadow-geist-lg bg-background animate-fade-in">
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

          <div className="divider my-1" />

          {/* Profile */}
          <Button type="button" variant="tertiary" size="sm" className={menuBtn} leftIcon={<User size={16} strokeWidth={2} className="shrink-0 opacity-60" />} disabled>
            {t("menu.profile")}
          </Button>

          {/* Account Settings */}
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            className={menuBtn}
            leftIcon={<Settings size={16} strokeWidth={2} className="shrink-0 opacity-60" />}
            onClick={() => {
              setOpen(false);
              onOpenAccountSettings?.();
            }}
          >
            {t("menu.accountSettings")}
          </Button>

          <div className="divider my-1" />

          {/* Feedback */}
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            className={menuBtn}
            leftIcon={<MessageSquare size={16} strokeWidth={2} className="shrink-0 opacity-60" />}
            onClick={() => {
              setOpen(false);
              onOpenFeedback?.();
            }}
          >
            {t("menu.feedback")}
          </Button>

          <div className="divider my-1" />

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
            <ThemeToggle />
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

          <div className="divider my-1" />

          {/* Sign Out */}
          <Button
            type="button"
            variant="tertiary"
            size="sm"
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