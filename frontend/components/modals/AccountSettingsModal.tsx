"use client";

import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/store/i18nStore";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import {
  fetchProfilePreferences,
  patchProfilePreferences,
} from "@/lib/profilePreferences";
import { getErrorMessage } from "@/lib/request";

function parseManualLevelOverride(value: unknown): "auto" | 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3 ? value : "auto";
}

function parseCurrentLevel(value: unknown): 1 | 2 | 3 | null {
  return value === 1 || value === 2 || value === 3 ? value : null;
}

export function AccountSettingsModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const setLevel = useUserLevelStore((s) => s.setLevel);
  const currentLevel = useUserLevelStore((s) => s.level);
  
  const [activeTab, setActiveTab] = useState<"general">("general");
  const [override, setOverride] = useState<"auto" | 1 | 2 | 3>("auto");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadPreferences = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await fetchProfilePreferences();
      setOverride(parseManualLevelOverride(data.manual_level_override));
    } catch (error) {
      setOverride("auto");
      setLoadError(getErrorMessage(error, t("settings.loadError")));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (open) {
      void loadPreferences();
    }
  }, [loadPreferences, open]);

  const handleOverrideChange = async (val: "auto" | 1 | 2 | 3) => {
    const previousOverride = override;
    const previousLevel = currentLevel;
    setOverride(val);
    setSaveError(null);

    if (val !== "auto") {
      setLevel(val);
    }

    setIsSaving(true);

    try {
      const data = await patchProfilePreferences({
        manual_level_override: val === "auto" ? null : val,
      });
      const persistedOverride = parseManualLevelOverride(data.manual_level_override);
      setOverride(persistedOverride);
      const persistedLevel = parseCurrentLevel(data.current_level);
      if (persistedLevel !== null) {
        setLevel(persistedLevel);
      } else if (persistedOverride !== "auto") {
        setLevel(persistedOverride);
      }
    } catch (error) {
      setOverride(previousOverride);
      if (previousOverride !== "auto") {
        setLevel(previousOverride);
      } else {
        setLevel(previousLevel);
      }
      setSaveError(getErrorMessage(error, t("settings.saveError")));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px] p-0 flex flex-col md:flex-row min-h-[400px]">
        {/* Sidebar Tabs */}
        <div className="w-full md:w-[200px] border-b md:border-b-0 md:border-r border-gray-alpha-200 bg-gray-alpha-50 p-4 shrink-0">
          <h2 className="mb-4 px-2 text-[14px] font-semibold text-ds-text">{t("settings.title")}</h2>
          <nav className="flex flex-row md:flex-col gap-1">
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              onClick={() => setActiveTab("general")}
              className={`w-full justify-start rounded-lg px-3 text-[14px] font-medium text-left shadow-none ${
                activeTab === "general"
                  ? "bg-gray-alpha-200 text-ds-text"
                  : "text-ds-text-secondary hover:bg-gray-alpha-200"
              }`}
            >
              {t("settings.general")}
            </Button>
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6">
          {activeTab === "general" && (
            <div className="animate-fade-in">
              <h3 className="mb-1 text-[16px] font-semibold text-ds-text">{t("settings.levelOverride")}</h3>
              <p className="mb-6 text-[14px] text-ds-text-tertiary">
                {t("settings.levelDescription")}
              </p>

              {loadError && (
                <ErrorState
                  className="mb-4"
                  description={loadError}
                  actionLabel={t("common.retry")}
                  onAction={() => { void loadPreferences(); }}
                />
              )}

              {saveError && (
                <ErrorState className="mb-4" description={saveError} />
              )}

              {isLoading ? (
                <div className="animate-pulse flex flex-col gap-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-[42px] rounded-lg bg-gray-alpha-100" />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {[
                    { value: "auto" as const, label: t("settings.levelAuto") },
                    { value: 1 as const, label: t("settings.levelL1") },
                    { value: 2 as const, label: t("settings.levelL2") },
                    { value: 3 as const, label: t("settings.levelL3") },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors ${
                        override === option.value
                          ? "border-foreground bg-gray-alpha-100"
                          : "border-gray-alpha-200 hover:border-gray-alpha-400"
                      }`}
                    >
                      <span className="text-[14px] font-medium text-ds-text">{option.label}</span>
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-alpha-400">
                        {override === option.value && (
                          <div className="h-2.5 w-2.5 rounded-full bg-foreground" />
                        )}
                      </div>
                      <Input
                        type="radio"
                        variant="ghost"
                        className="hidden"
                        inputClassName="hidden"
                        disabled={isSaving}
                        checked={override === option.value}
                        onChange={() => { void handleOverrideChange(option.value); }}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          
        </div>
      </DialogContent>
    </Dialog>
  );
}