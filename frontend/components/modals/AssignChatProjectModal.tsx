"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleDashed, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProjectIcon } from "@/components/projects/ProjectIcon";
import type { Project } from "@/lib/store/projectStore";
import { useTranslation } from "@/lib/store/i18nStore";
import { cn } from "@/lib/utils";

interface AssignChatProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  currentProjectId: string | null;
  chatTitle: string;
  onAssign: (projectId: string | null) => Promise<void> | void;
}

export function AssignChatProjectModal({
  open,
  onOpenChange,
  projects,
  currentProjectId,
  onAssign,
}: AssignChatProjectModalProps) {
  const { t } = useTranslation();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(currentProjectId);
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedProjectId(currentProjectId);
    const timeoutId = window.setTimeout(() => {
      searchRef.current?.focus();
      searchRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [currentProjectId, open]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredProjects = useMemo(
    () =>
      normalizedQuery
        ? projects.filter((project) => project.name.toLowerCase().includes(normalizedQuery))
        : projects,
    [normalizedQuery, projects],
  );

  const canSubmit = !isAssigning && selectedProjectId !== currentProjectId;
  const hasNoSearchResults = normalizedQuery.length > 0 && filteredProjects.length === 0;
  const shouldScrollProjects = projects.length > 2;

  const handleClose = () => {
    if (isAssigning) return;
    onOpenChange(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setIsAssigning(true);
    try {
      await onAssign(selectedProjectId);
      onOpenChange(false);
    } finally {
      setIsAssigning(false);
    }
  };

  const handleProjectListWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!shouldScrollProjects) return;

    const element = event.currentTarget;
    const maxScrollTop = element.scrollHeight - element.clientHeight;
    if (maxScrollTop <= 0) return;

    const isScrollingUp = event.deltaY < 0;
    const isScrollingDown = event.deltaY > 0;
    const isAtTop = element.scrollTop <= 0;
    const isAtBottom = element.scrollTop >= maxScrollTop - 1;

    if ((isScrollingUp && isAtTop) || (isScrollingDown && isAtBottom)) {
      event.preventDefault();
    }

    event.stopPropagation();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} onCancel={handleClose}>
      <DialogContent className="max-w-[540px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {currentProjectId ? t("projects.changeProject") : t("projects.moveToProject")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 px-6 py-4">
            <Input
              ref={searchRef}
              variant="default"
              size="md"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("projects.searchPlaceholder")}
              leftIcon={<Search size={16} strokeWidth={2} className="text-ds-text-tertiary" />}
              disabled={isAssigning || projects.length === 0}
              className="bg-background-100"
              inputClassName="text-[14px]"
            />

            <div
              onWheel={handleProjectListWheel}
              className={cn(
                "overflow-y-auto overscroll-none [overflow-anchor:none]",
                shouldScrollProjects ? "max-h-[124px] pr-1" : "max-h-none",
              )}
              style={{
                overflowAnchor: "none",
                scrollBehavior: "auto",
                ...(shouldScrollProjects ? { scrollbarGutter: "stable" } : {}),
              }}
            >
              <div className="space-y-0.5 pb-2">
                <button
                  type="button"
                  onClick={() => setSelectedProjectId(null)}
                  disabled={isAssigning}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors duration-150",
                    selectedProjectId === null
                      ? "bg-gray-alpha-200 text-ds-text"
                      : "bg-transparent text-ds-text hover:bg-gray-alpha-200",
                  )}
                >
                  <CircleDashed
                    size={18}
                    strokeWidth={2}
                    className="shrink-0 text-ds-text"
                  />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium leading-5">
                    {t("projects.noProject")}
                  </span>
                  <Check
                    size={16}
                    strokeWidth={2.5}
                    className={cn(
                      "shrink-0 text-ds-text-tertiary transition-opacity duration-150",
                      selectedProjectId === null ? "opacity-100" : "opacity-0",
                    )}
                  />
                </button>

                {projects.length === 0 ? (
                  <div className="grid min-h-[96px] place-items-center px-3 py-5 text-center text-[14px] leading-5 text-ds-text-tertiary">
                    {t("projects.noProjectsForAssign")}
                  </div>
                ) : hasNoSearchResults ? (
                  <div className="grid min-h-[96px] place-items-center px-3 py-5 text-center text-[14px] leading-5 text-ds-text-tertiary">
                    {t("projects.assignChatNoSearchResults")}
                  </div>
                ) : (
                  filteredProjects.map((project) => {
                    const isSelected = selectedProjectId === project.id;

                    return (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => setSelectedProjectId(project.id)}
                        disabled={isAssigning}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors duration-150",
                          isSelected
                            ? "bg-gray-alpha-200 text-ds-text"
                            : "bg-transparent text-ds-text hover:bg-gray-alpha-200",
                        )}
                      >
                        <ProjectIcon
                          iconName={project.icon_name}
                          color={project.accent_color}
                          size={18}
                          strokeWidth={2}
                        />
                        <span className="min-w-0 flex-1 truncate text-[15px] font-medium leading-5">
                          {project.name}
                        </span>
                        <Check
                          size={16}
                          strokeWidth={2.5}
                          className={cn(
                            "shrink-0 text-ds-text-tertiary transition-opacity duration-150",
                            isSelected ? "opacity-100" : "opacity-0",
                          )}
                        />
                      </button>
                    );
                  })
                )}

                {shouldScrollProjects ? <div aria-hidden="true" className="h-1" /> : null}
              </div>
            </div>
          </div>

          <DialogFooter>
            <div className="flex w-full items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleClose}
                disabled={isAssigning}
              >
                {t("projects.cancel")}
              </Button>
              <Button
                type="submit"
                variant="default"
                size="sm"
                isLoading={isAssigning}
                disabled={!canSubmit}
              >
                {t("projects.moveAction")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
