import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const kbdVariants = cva(
  "inline-flex items-center justify-center rounded-md border border-gray-alpha-400 bg-background-100 font-sans font-medium leading-none text-ds-text select-none shrink-0",
  {
    variants: {
      size: {
        sm: "h-5 min-w-5 px-1 text-[13px]",
        md: "h-7 min-w-7 px-1.5 text-[13px]",
        lg: "h-9 min-w-9 px-2 text-[15px]",
      },
    },
    defaultVariants: { size: "md" },
  },
);

type KbdKey =
  | React.ReactNode
  | "cmd"
  | "ctrl"
  | "shift"
  | "alt"
  | "option"
  | "enter"
  | "return"
  | "escape"
  | "tab"
  | "up"
  | "down"
  | "left"
  | "right";

const KEY_GLYPHS: Record<string, string> = {
  cmd: "⌘",
  shift: "⇧",
  alt: "⌥",
  option: "⌥",
  enter: "↵",
  return: "↵",
  escape: "⎋",
  tab: "⇥",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};

function renderKey(key: KbdKey): React.ReactNode {
  if (typeof key === "string") {
    const lower = key.toLowerCase();
    if (lower in KEY_GLYPHS) return KEY_GLYPHS[lower];
  }
  return key;
}

export interface KbdProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof kbdVariants> {
  keys?: KbdKey[];
}

const Kbd = React.forwardRef<HTMLElement, KbdProps>(
  ({ className, size, keys, children, ...props }, ref) => {
    if (keys && keys.length > 0) {
      return (
        <span
          ref={ref as React.Ref<HTMLSpanElement>}
          className={cn("inline-flex items-center gap-1", className)}
        >
          {keys.map((key, i) => (
            <kbd key={i} className={kbdVariants({ size })} {...props}>
              {renderKey(key)}
            </kbd>
          ))}
        </span>
      );
    }
    return (
      <kbd
        ref={ref as React.Ref<HTMLElement>}
        className={cn(kbdVariants({ size }), className)}
        {...props}
      >
        {children}
      </kbd>
    );
  },
);
Kbd.displayName = "Kbd";

export { Kbd, kbdVariants };
