"use client";

import type { ReactNode } from "react";
import { Layers, UserRound } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/store/i18nStore";
import { cn } from "@/lib/utils";

type SettingsTab = "general" | "adaptation" | "account";

const TAB_DEFINITIONS: Array<{
  key: SettingsTab;
  labelKey: string;
  icon: typeof UserRound;
}> = [
  { key: "general", labelKey: "settings.general", icon: UserRound },
  { key: "adaptation", labelKey: "settings.adaptation", icon: Layers },
  { key: "account", labelKey: "settings.account", icon: UserRound },
];

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2.5 px-1 text-[12.5px] font-medium text-ds-text-tertiary">
      {children}
    </p>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-alpha-200 bg-background-100">
      {children}
    </div>
  );
}

function Row({
  title,
  description,
  control,
  children,
}: {
  title: string;
  description?: string;
  control?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-ds-text">{title}</p>
          {description && (
            <p className="mt-1 text-[13px] leading-relaxed text-ds-text-tertiary">
              {description}
            </p>
          )}
        </div>
        {control && <div className="shrink-0 self-center">{control}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

function RowDivider() {
  return <div className="border-t border-gray-alpha-200" />;
}

function ToggleSkeleton() {
  return <Skeleton width={40} height={24} className="rounded-full" />;
}

export default function SettingsLoading() {
  const { t } = useTranslation();
  const activeTab: SettingsTab = "general";

  return (
    <main className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
      <div className="mx-auto max-w-6xl px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
        <div className="space-y-8">
          <div>
            <h1 className="text-[28px] font-semibold text-ds-text sm:text-[32px]">
              {t("settings.title")}
            </h1>
            <p className="mt-1 text-[14px] text-ds-text-tertiary">
              {t("settings.subtitle")}
            </p>
          </div>

          <div className="flex flex-col gap-8 lg:flex-row">
            <aside className="shrink-0 lg:w-[224px]">
              <nav className="sticky top-6 flex flex-col gap-1 overflow-x-auto lg:overflow-visible">
                <div className="flex gap-1 lg:flex-col">
                  {TAB_DEFINITIONS.map(({ key, labelKey, icon: Icon }) => {
                    const isActive = activeTab === key;
                    return (
                      <div
                        key={key}
                        className={cn(
                          "group flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium",
                          isActive
                            ? "bg-gray-alpha-200 text-ds-text"
                            : "text-ds-text-secondary",
                        )}
                      >
                        <Icon
                          size={15}
                          strokeWidth={2}
                          className={isActive ? "text-ds-text" : "text-ds-text-tertiary"}
                        />
                        <span className="flex-1 whitespace-nowrap">{t(labelKey)}</span>
                      </div>
                    );
                  })}
                </div>
              </nav>
            </aside>

            <div className="min-w-0 flex-1 space-y-8">
              <section className="space-y-8">
                <div>
                  <SectionLabel>{t("settings.sectionProfile")}</SectionLabel>
                  <Card>
                    <div className="flex items-center gap-4 px-5 py-4">
                      <Skeleton width={48} height={48} className="rounded-full" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton height={16} width="32%" />
                        <Skeleton height={14} width="44%" />
                      </div>
                    </div>

                    <RowDivider />

                    <Row
                      title={t("settings.displayName")}
                      description={t("settings.displayNameDescription")}
                    >
                      <Skeleton height={36} width="100%" className="rounded-lg" />
                    </Row>
                  </Card>
                </div>

                <div>
                  <SectionLabel>{t("settings.sectionInterface")}</SectionLabel>
                  <Card>
                    <Row
                      title={t("menu.theme")}
                      description={t("settings.themeDescription")}
                      control={<Skeleton width={96} height={32} className="rounded-full" />}
                    />
                    <RowDivider />
                    <Row
                      title={t("menu.language")}
                      description={t("settings.languageDescription")}
                      control={<Skeleton width={92} height={32} className="rounded-lg" />}
                    />
                  </Card>
                </div>

                <div>
                  <SectionLabel>{t("settings.sectionNotifications")}</SectionLabel>
                  <Card>
                    <Row
                      title={t("settings.notifLevelUp")}
                      description={t("settings.notifLevelUpDescription")}
                      control={<ToggleSkeleton />}
                    />
                    <RowDivider />
                    <Row
                      title={t("settings.notifMicroFeedback")}
                      description={t("settings.notifMicroFeedbackDescription")}
                      control={<ToggleSkeleton />}
                    />
                    <RowDivider />
                    <Row
                      title={t("settings.notifTutorToast")}
                      description={t("settings.notifTutorToastDescription")}
                      control={<ToggleSkeleton />}
                    />
                  </Card>
                </div>

                <div>
                  <SectionLabel>{t("settings.sectionPrivacy")}</SectionLabel>
                  <Card>
                    <Row
                      title={t("settings.adaptiveTracking")}
                      description={t("settings.adaptiveTrackingDescription")}
                      control={<ToggleSkeleton />}
                    />
                    <RowDivider />
                    <Row
                      title={t("settings.restoreHiddenTemplates")}
                      description={t("settings.restoreHiddenTemplatesDescription")}
                      control={<Skeleton width={132} height={32} className="rounded-lg" />}
                    />
                  </Card>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
