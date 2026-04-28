"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/store/i18nStore";

export function AccountSettingsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader withSeparator={false} className="px-6 pt-6 pb-3">
          <DialogTitle>{t("settings.title")}</DialogTitle>
          <DialogDescription>{t("settings.modalMovedDescription")}</DialogDescription>
        </DialogHeader>

        <DialogFooter withSeparator={false} className="px-6 pt-1 pb-6">
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              {t("config.cancel")}
            </Button>
            <Button
              as={Link}
              href="/settings"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                router.push("/settings");
              }}
            >
              {t("menu.accountSettings")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
