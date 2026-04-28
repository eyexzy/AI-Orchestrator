import * as React from "react"
import { cn } from "@/lib/utils"

export type ProgressVariant = "default" | "error" | "warning" | "gray"

const VARIANT_COLOR: Record<ProgressVariant, string> = {
  default: "var(--ds-blue-700)",
  error:   "var(--ds-red-700)",
  warning: "var(--ds-amber-700)",
  gray:    "var(--ds-gray-700)",
}

export interface ProgressProps extends React.HTMLAttributes<HTMLProgressElement> {
  value: number
  max?: number
  variant?: ProgressVariant
}

function Progress({
  value,
  max = 100,
  variant = "default",
  className,
  style,
  ...props
}: ProgressProps) {
  return (
    <progress
      value={value}
      max={max}
      className={cn("geist-progress", className)}
      style={{ "--progress-fg": VARIANT_COLOR[variant], ...style } as React.CSSProperties}
      {...props}
    />
  )
}

export { Progress }
