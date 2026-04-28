"use client";

import { cn } from "@/lib/utils";
import {
  getProjectColor,
  getProjectIconComponent,
  PROJECT_COLOR_ICON_CLASSES,
} from "@/components/projects/projectTheme";

interface ProjectIconProps {
  iconName?: string | null;
  color?: string | null;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function ProjectIcon({
  iconName,
  color,
  size = 16,
  strokeWidth = 2,
  className,
}: ProjectIconProps) {
  const Icon = getProjectIconComponent(iconName);
  const resolvedColor = getProjectColor(color);

  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden="true"
      className={cn(
        "block shrink-0",
        PROJECT_COLOR_ICON_CLASSES[resolvedColor],
        className,
      )}
    />
  );
}
