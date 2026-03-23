import { readResponseError } from "@/lib/request";

export interface ProfilePreferences {
  theme: string;
  language: string;
  current_level: 1 | 2 | 3;
  initial_level: 1 | 2 | 3;
  self_assessed_level: 1 | 2 | 3 | null;
  manual_level_override: 1 | 2 | 3 | null;
  onboarding_completed: boolean;
  hidden_templates: string[];
}

export type ProfilePreferencesPatch = Partial<ProfilePreferences>;

export async function fetchProfilePreferences(): Promise<ProfilePreferences> {
  const res = await fetch("/api/profile/preferences", { cache: "no-store" });
  if (!res.ok) {
    throw new Error(await readResponseError(res, "Failed to load preferences"));
  }
  return res.json();
}

export async function patchProfilePreferences(
  body: ProfilePreferencesPatch,
): Promise<ProfilePreferences> {
  const res = await fetch("/api/profile/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(await readResponseError(res, "Failed to save preferences"));
  }

  return res.json();
}