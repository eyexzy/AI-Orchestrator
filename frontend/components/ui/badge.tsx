import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap transition-colors",
  {
    variants: {
      variant: {
        /* Subtle */
        "gray-subtle": "bg-gray-200 text-gray-1000",
        "blue-subtle": "bg-blue-200 text-blue-900",
        "purple-subtle": "bg-purple-200 text-purple-900",
        "amber-subtle": "bg-amber-200 text-amber-900",
        "red-subtle": "bg-red-200 text-red-900",
        "pink-subtle": "bg-pink-200 text-pink-900",
        "green-subtle": "bg-green-200 text-green-900",
        "teal-subtle": "bg-teal-200 text-teal-900",

        /* Solid */
        gray: "bg-gray-700 text-background-100",
        blue: "bg-blue-700 text-background-100",
        purple: "bg-purple-700 text-background-100",
        amber: "bg-amber-700 text-black",
        red: "bg-red-700 text-background-100",
        pink: "bg-pink-700 text-background-100",
        green: "bg-green-700 text-background-100",
        teal: "bg-teal-700 text-background-100",

        /* Inverted */
        inverted: "bg-foreground text-background",

        /* Special (gradients) */
        trial: "bg-gradient-to-br from-[#0070F3] to-[#F81CE5] text-white",
        turborepo: "bg-gradient-to-br from-[#FF1E56] to-[#0096FF] text-white",
      },
      size: {
        sm: "h-5 px-1.5 text-[11px] leading-[11px] gap-0.5",
        md: "h-6 px-2.5 text-[12px] leading-[12px] gap-1",
        lg: "h-8 px-3 text-[14px] leading-[20px] gap-1.5",
      },
    },
    defaultVariants: { variant: "gray-subtle", size: "md" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
  VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };