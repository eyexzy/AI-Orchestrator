import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import {
  AlertTriangle,
  Info,
  XOctagon,
  CheckCircle2,
} from "lucide-react"

/* ── Variants ─────────────────────────────────────────────────────────────── */

const noteVariants = cva(
  "w-full flex items-center gap-3 rounded-[6px] border px-3 py-2 text-[14px] leading-[21px] font-normal antialiased justify-between",
  {
    variants: {
      variant: {
        /* filled (default) — bg = color-100, border = color-200, text = color-900 */
        default: "bg-[var(--ds-gray-100)]   border-[var(--ds-gray-200)]   text-[var(--ds-gray-900)]",
        info:    "bg-[var(--ds-blue-100)]   border-[var(--ds-blue-200)]   text-[var(--ds-blue-900)]",
        success: "bg-[var(--ds-green-100)]  border-[var(--ds-green-200)]  text-[var(--ds-green-900)]",
        warning: "bg-[var(--ds-amber-100)]  border-[var(--ds-amber-200)]  text-[var(--ds-amber-900)]",
        error:   "bg-[var(--ds-red-100)]    border-[var(--ds-red-200)]    text-[var(--ds-red-900)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

/* ── Icons ────────────────────────────────────────────────────────────────── */

const NOTE_ICONS: Record<string, React.ElementType> = {
  default: Info,
  info:    Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error:   XOctagon,
}

/* ── Types ────────────────────────────────────────────────────────────────── */

export interface NoteProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof noteVariants> {
  hideIcon?: boolean
  action?: React.ReactNode
  /** Kept for backward compat, ignored */
  fill?: boolean
  size?: "default" | "sm"
}

/* ── Component ────────────────────────────────────────────────────────────── */

function Note({
  className,
  variant = "default",
  hideIcon = false,
  action,
  fill: _fill,
  size: _size,
  children,
  ...props
}: NoteProps) {
  const Icon = NOTE_ICONS[variant ?? "default"] ?? Info

  return (
    <div
      className={cn(noteVariants({ variant }), className)}
      {...props}
    >
      {/* Left: icon + content */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {!hideIcon && (
          <span className="flex shrink-0" style={{ display: "flex", height: 16 }}>
            <Icon size={16} strokeWidth={2} />
          </span>
        )}
        <span className="flex-1 min-w-0 break-words">{children}</span>
      </div>

      {/* Right: action */}
      {action && (
        <div className="shrink-0 ml-3">{action}</div>
      )}
    </div>
  )
}

export { Note, noteVariants }
