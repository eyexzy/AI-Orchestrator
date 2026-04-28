"use client";

import { memo } from "react";

const NEXA_LOGO_PATH =
  "M0 0L49.1547 23.4057L67.2895 74.9797V23.4057L95.7249 0V130L49.1547 105.386L28.7266 56.1889V105.386L0 130V0Z";

function NexaAvatarComponent({ animated = false }: { animated?: boolean }) {
  return (
    <div className="nexa-avatar" aria-hidden="true">
      {animated && <span className="nexa-avatar__ring" />}
      <svg
        className="nexa-avatar__logo"
        viewBox="0 0 96 130"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d={NEXA_LOGO_PATH} fill="currentColor" />
      </svg>
    </div>
  );
}

export const NexaAvatar = memo(NexaAvatarComponent);
NexaAvatar.displayName = "NexaAvatar";
