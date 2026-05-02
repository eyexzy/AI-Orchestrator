"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Star, Trash2 } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Description } from "@/components/ui/description";
import { ProjectIcon } from "@/components/projects/ProjectIcon";
import { useTranslation } from "@/lib/store/i18nStore";
import type { Project } from "@/lib/store/projectStore";

interface ProjectCardProps {
  project: Project;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function formatUpdatedAt(updatedAt: string | null, locale: string, prefix: string) {
  if (!updatedAt) return "";

  try {
    const date = new Date(updatedAt);
    if (Number.isNaN(date.getTime())) return "";

    const diffMs = date.getTime() - Date.now();
    const absMs = Math.abs(diffMs);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    const month = 30 * day;
    const year = 365 * day;

    let value: number;
    let unit: Intl.RelativeTimeFormatUnit;

    if (absMs < hour) {
      value = Math.round(diffMs / minute) || -1;
      unit = "minute";
    } else if (absMs < day) {
      value = Math.round(diffMs / hour);
      unit = "hour";
    } else if (absMs < week) {
      value = Math.round(diffMs / day);
      unit = "day";
    } else if (absMs < month) {
      value = Math.round(diffMs / week);
      unit = "week";
    } else if (absMs < year) {
      value = Math.round(diffMs / month);
      unit = "month";
    } else {
      value = Math.round(diffMs / year);
      unit = "year";
    }

    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    return `${prefix} ${formatter.format(value, unit)}`;
  } catch {
    return updatedAt;
  }
}

export function ProjectCard({
  project,
  onOpen,
  onToggleFavorite,
  onEdit,
  onDelete,
}: ProjectCardProps) {
  const router = useRouter();
  const { t, language } = useTranslation();
  const menuAnchorRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const updatedLabel = formatUpdatedAt(
    project.updated_at,
    language === "uk" ? "uk-UA" : "en-US",
    t("projects.updatedLabel"),
  );
  const prefetchProjectRoute = () => {
    router.prefetch(`/projects/${project.id}`);
  };

  return (
    <>
      <div className="relative min-h-[168px] overflow-hidden rounded-md border border-gray-alpha-400 bg-background-100 transition-colors duration-150 hover:bg-gray-alpha-200">
        <div className="grid min-h-[168px] w-full grid-rows-[52px_56px_20px] px-6 py-5">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div
              role="button"
              tabIndex={0}
              onClick={onOpen}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpen();
                }
              }}
              onMouseEnter={prefetchProjectRoute}
              onFocus={prefetchProjectRoute}
              className="min-w-0 flex-1 cursor-pointer outline-none focus:outline-none focus-visible:outline-none"
            >
              <div className="flex min-w-0 items-start gap-2">
                <ProjectIcon
                  iconName={project.icon_name}
                  color={project.accent_color}
                  size={20}
                  className="mt-0.5"
                />
                <h3 className="line-clamp-2 min-h-[52px] min-w-0 overflow-hidden break-words text-[20px] font-semibold leading-tight text-ds-text">
                  {project.name}
                </h3>
              </div>
            </div>

            <button
              ref={menuAnchorRef}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen((value) => !value);
              }}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-ds-text-tertiary outline-none transition-colors duration-150 hover:bg-gray-alpha-200 hover:text-ds-text focus:outline-none focus-visible:outline-none"
              aria-label={t("projects.projectActions")}
            >
              <MoreHorizontal size={16} strokeWidth={2} />
            </button>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen();
              }
            }}
            onMouseEnter={prefetchProjectRoute}
            onFocus={prefetchProjectRoute}
            className="min-w-0 cursor-pointer overflow-hidden pt-2 outline-none focus:outline-none focus-visible:outline-none"
          >
            {project.description ? (
              <Description className="line-clamp-2 max-w-full overflow-hidden break-words leading-6">
                {project.description}
              </Description>
            ) : null}
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen();
              }
            }}
            onMouseEnter={prefetchProjectRoute}
            onFocus={prefetchProjectRoute}
            className="cursor-pointer self-end truncate text-[13px] leading-4 text-ds-text-tertiary outline-none focus:outline-none focus-visible:outline-none"
          >
            {updatedLabel}
          </div>
        </div>
      </div>

      {menuOpen && (
        <ActionMenu
          anchorEl={menuAnchorRef.current}
          align="end"
          onClose={() => setMenuOpen(false)}
          items={[
            {
              label: project.is_favorite ? t("projects.unstarProject") : t("projects.starProject"),
              icon: (
                <Star
                  size={14}
                  strokeWidth={2}
                  className={project.is_favorite ? "fill-current" : ""}
                />
              ),
              onClick: () => {
                setMenuOpen(false);
                onToggleFavorite();
              },
            },
            {
              label: t("projects.editProject"),
              icon: <Pencil size={14} strokeWidth={2} />,
              onClick: () => {
                setMenuOpen(false);
                onEdit();
              },
            },
            {
              label: t("projects.delete"),
              icon: <Trash2 size={14} strokeWidth={2} />,
              onClick: () => {
                setMenuOpen(false);
                onDelete();
              },
              confirm: {
                title: t("confirm.deleteProjectTitle"),
                description: t("confirm.deleteProjectDescription"),
                actionLabel: t("projects.delete"),
              },
              variant: "danger",
            },
          ]}
        />
      )}
    </>
  );
}
