"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/store/i18nStore";
import { useUserLevelStore, type UserLevel } from "@/lib/store/userLevelStore";

async function patchPreferences(body: Record<string, any>) {
  try {
    await fetch("/api/profile/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    /* silent */
  }
}

export function AccountSettingsModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const setLevel = useUserLevelStore((s) => s.setLevel);
  
  const [activeTab, setActiveTab] = useState<"general" | "advanced">("general");
  const [override, setOverride] = useState<"auto" | 1 | 2 | 3>("auto");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setIsLoading(true);
      fetch("/api/profile/preferences")
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch preferences");
          return res.json();
        })
        .then((data) => {
          if (data.manual_level_override !== undefined && data.manual_level_override !== null) {
            setOverride(data.manual_level_override as 1 | 2 | 3);
          } else {
            setOverride("auto");
          }
        })
        .catch(() => {
          setOverride("auto");
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [open]);

  const handleOverrideChange = (val: "auto" | 1 | 2 | 3) => {
    setOverride(val);
    
    if (val !== "auto") {
      setLevel(val as UserLevel);
    }
    
    patchPreferences({
      manual_level_override: val === "auto" ? null : val,
    });
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
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              onClick={() => setActiveTab("advanced")}
              className={`w-full justify-start rounded-lg px-3 text-[14px] font-medium text-left shadow-none ${
                activeTab === "advanced"
                  ? "bg-gray-alpha-200 text-ds-text"
                  : "text-ds-text-secondary hover:bg-gray-alpha-200"
              }`}
            >
              {t("settings.advanced")}
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
                        checked={override === option.value}
                        onChange={() => handleOverrideChange(option.value)}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {activeTab === "advanced" && (
            <div className="animate-fade-in flex h-[200px] items-center justify-center">
              <p className="text-[14px] text-ds-text-tertiary">Advanced settings coming soon.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}