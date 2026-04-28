import type { LucideIcon } from "lucide-react";
import {
  BadgeDollarSign,
  BookOpen,
  Brain,
  BriefcaseBusiness,
  Camera,
  CodeXml,
  Folder,
  FolderKanban,
  FlaskConical,
  Gift,
  Globe,
  GraduationCap,
  Heart,
  Landmark,
  Megaphone,
  Music4,
  NotebookText,
  Palette,
  Plane,
  Sparkles,
} from "lucide-react";
import type { BadgeProps } from "@/components/ui/badge";

export const PROJECT_COLOR_OPTIONS = [
  "gray",
  "blue",
  "purple",
  "pink",
  "red",
  "amber",
  "green",
  "teal",
] as const;

export type ProjectColor = (typeof PROJECT_COLOR_OPTIONS)[number];

export const PROJECT_ICON_OPTIONS = [
  "folder",
  "kanban",
  "briefcase",
  "graduation",
  "notebook",
  "book",
  "code",
  "flask",
  "brain",
  "palette",
  "landmark",
  "globe",
  "plane",
  "camera",
  "music",
  "megaphone",
  "heart",
  "gift",
  "money",
  "sparkles",
] as const;

export type ProjectIconName = (typeof PROJECT_ICON_OPTIONS)[number];

export const PROJECT_BADGE_VARIANTS: Record<ProjectColor, NonNullable<BadgeProps["variant"]>> = {
  gray: "gray-subtle",
  blue: "blue-subtle",
  purple: "purple-subtle",
  pink: "pink-subtle",
  red: "red-subtle",
  amber: "amber-subtle",
  green: "green-subtle",
  teal: "teal-subtle",
};

export const PROJECT_COLOR_SWATCH_CLASSES: Record<ProjectColor, string> = {
  gray: "bg-black dark:bg-white shadow-[0_0_0_1px_var(--ds-gray-alpha-400)]",
  blue: "bg-blue-700",
  purple: "bg-purple-700",
  pink: "bg-pink-700",
  red: "bg-red-700",
  amber: "bg-amber-700",
  green: "bg-green-700",
  teal: "bg-teal-700",
};

export const PROJECT_COLOR_RING_CLASSES: Record<ProjectColor, string> = {
  gray: "ring-black dark:ring-white",
  blue: "ring-blue-700",
  purple: "ring-purple-700",
  pink: "ring-pink-700",
  red: "ring-red-700",
  amber: "ring-amber-700",
  green: "ring-green-700",
  teal: "ring-teal-700",
};

export const PROJECT_COLOR_ICON_CLASSES: Record<ProjectColor, string> = {
  gray: "text-gray-1000",
  blue: "text-blue-900",
  purple: "text-purple-900",
  pink: "text-pink-900",
  red: "text-red-900",
  amber: "text-amber-900",
  green: "text-green-900",
  teal: "text-teal-900",
};

export const PROJECT_ICON_COMPONENTS: Record<ProjectIconName, LucideIcon> = {
  folder: Folder,
  kanban: FolderKanban,
  briefcase: BriefcaseBusiness,
  graduation: GraduationCap,
  notebook: NotebookText,
  book: BookOpen,
  code: CodeXml,
  flask: FlaskConical,
  brain: Brain,
  palette: Palette,
  landmark: Landmark,
  globe: Globe,
  plane: Plane,
  camera: Camera,
  music: Music4,
  megaphone: Megaphone,
  heart: Heart,
  gift: Gift,
  money: BadgeDollarSign,
  sparkles: Sparkles,
};

export const PROJECT_ICON_LABELS: Record<ProjectIconName, string> = {
  folder: "Folder",
  kanban: "Board",
  briefcase: "Work",
  graduation: "Study",
  notebook: "Notes",
  book: "Book",
  code: "Code",
  flask: "Science",
  brain: "Ideas",
  palette: "Design",
  landmark: "Law",
  globe: "Global",
  plane: "Travel",
  camera: "Media",
  music: "Music",
  megaphone: "Marketing",
  heart: "Personal",
  gift: "Gift",
  money: "Finance",
  sparkles: "Creative",
};

export function isProjectColor(value: string): value is ProjectColor {
  return PROJECT_COLOR_OPTIONS.includes(value as ProjectColor);
}

export function getProjectColor(value: string | null | undefined): ProjectColor {
  return value && isProjectColor(value) ? value : "blue";
}

export function isProjectIconName(value: string): value is ProjectIconName {
  return PROJECT_ICON_OPTIONS.includes(value as ProjectIconName);
}

export function getProjectIconName(value: string | null | undefined): ProjectIconName {
  return value && isProjectIconName(value) ? value : "folder";
}

export function getProjectIconComponent(
  value: string | null | undefined,
): LucideIcon {
  return PROJECT_ICON_COMPONENTS[getProjectIconName(value)];
}
