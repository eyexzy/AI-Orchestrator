"use client";

import { useEffect } from "react";
import { ArrowUp, ArrowDown, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUserLevelStore, LevelTransition } from "@/lib/store/userLevelStore";
import { useTranslation } from "@/lib/store/i18nStore";
import { trackEvent, flushEvents } from "@/lib/eventTracker";

function LevelBadge({ level }: { level: 1 | 2 | 3 }) {
  const labels = ["L1", "L2", "L3"];
  const colors = [
    "bg-green-100 text-green-800 border-green-200",
    "bg-blue-100 text-blue-800 border-blue-200",
    "bg-purple-100 text-purple-800 border-purple-200",
  ];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[13px] font-semibold ${colors[level - 1]}`}>
      {labels[level - 1]}
    </span>
  );
}

interface LevelTransitionModalProps {
  transition: LevelTransition;
  onDismiss: () => void;
}

function LevelTransitionContent({ transition, onDismiss }: LevelTransitionModalProps) {
  const { t } = useTranslation();
  const isUpgrade = transition.direction === "up";

  useEffect(() => {
    trackEvent(isUpgrade ? "level_upgrade_shown" : "level_downgrade_shown", {
      from_level: transition.fromLevel,
      to_level: transition.toLevel,
    });
    flushEvents();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDismiss = () => {
    trackEvent(isUpgrade ? "level_upgrade_acknowledged" : "level_downgrade_acknowledged", {
      from_level: transition.fromLevel,
      to_level: transition.toLevel,
    });
    flushEvents();
    onDismiss();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {isUpgrade ? (
            <ArrowUp size={18} strokeWidth={2} className="text-blue-600" />
          ) : (
            <ArrowDown size={18} strokeWidth={2} className="text-amber-600" />
          )}
          {t(isUpgrade ? "levelTransition.upgradeTitle" : "levelTransition.downgradeTitle")}
        </DialogTitle>
        <DialogDescription>
          {t(isUpgrade ? "levelTransition.upgradeDescription" : "levelTransition.downgradeDescription")}
        </DialogDescription>
      </DialogHeader>

      <div className="px-6 py-5 space-y-4">
        {/* Level change visualization */}
        <div className="flex items-center justify-center gap-4 rounded-xl border border-gray-alpha-200 bg-background-100 py-5">
          <div className="flex flex-col items-center gap-1.5">
            <LevelBadge level={transition.fromLevel} />
            <span className="text-[13px] text-ds-text-tertiary">{t("levelTransition.from")}</span>
          </div>
          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${isUpgrade ? "bg-blue-100 text-blue-600" : "bg-amber-100 text-amber-600"}`}>
            {isUpgrade ? (
              <ArrowUp size={16} strokeWidth={2.5} />
            ) : (
              <ArrowDown size={16} strokeWidth={2.5} />
            )}
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <LevelBadge level={transition.toLevel} />
            <span className="text-[13px] text-ds-text-tertiary">{t("levelTransition.to")}</span>
          </div>
        </div>

        {/* What changes */}
        <div className="space-y-2">
          <p className="text-[15px] font-semibold text-ds-text-secondary">
            {t("levelTransition.whatChanges")}
          </p>
          <ul className="space-y-1.5">
            {(t(`levelTransition.changes_L${transition.toLevel}`) as string)
              .split("|")
              .filter(Boolean)
              .map((line: string) => (
                <li key={line} className="flex items-start gap-2">
                  <Sparkles size={12} strokeWidth={2} className="mt-[3px] shrink-0 text-ds-text-tertiary" />
                  <span className="text-[14px] leading-5">{line.trim()}</span>
                </li>
              ))}
          </ul>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="default" size="sm" onClick={handleDismiss}>
          {t("levelTransition.gotIt")}
        </Button>
      </DialogFooter>
    </>
  );
}

export function LevelTransitionModal() {
  const transition = useUserLevelStore((s) => s.pendingLevelTransition);
  const dismissLevelTransition = useUserLevelStore((s) => s.dismissLevelTransition);

  return (
    <Dialog open={!!transition} onOpenChange={(v) => !v && dismissLevelTransition()}>
      <DialogContent className="max-w-[420px]">
        {transition && (
          <LevelTransitionContent transition={transition} onDismiss={dismissLevelTransition} />
        )}
      </DialogContent>
    </Dialog>
  );
}
