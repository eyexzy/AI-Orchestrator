import * as React from "react"
import { cn } from "@/lib/utils"

const MATERIAL_VARIANTS = {
    base: "rounded-md bg-background-100 shadow-geist-border hover:shadow-[0_0_0_1px_var(--ds-gray-alpha-300)]",
    small: "rounded-md bg-background-100 shadow-geist-md hover:shadow-[0_2px_4px_rgba(0,0,0,.08),0_0_0_1px_var(--ds-gray-alpha-200)]",
    medium: "rounded-xl bg-background-100 shadow-geist-lg",
    large: "rounded-xl bg-background-100 shadow-geist-lg",
    tooltip: "rounded-md bg-background-100 shadow-geist-lg",
    menu: "rounded-xl bg-background-100 shadow-geist-lg",
    modal: "rounded-xl bg-background-100 shadow-geist-lg",
    fullscreen: "rounded-2xl bg-background-100 shadow-geist-lg",
} as const

export interface MaterialProps extends React.HTMLAttributes<HTMLElement> {
    as?: React.ElementType;
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
    variant?: keyof typeof MATERIAL_VARIANTS;
}

const Material = React.forwardRef<HTMLElement, MaterialProps>(
    ({ className, as: Component = "div", variant = "base", ...props }, ref) => {
        return (
            <Component
                ref={ref}
                className={cn(
                    "overflow-hidden transition-[background-color,box-shadow] duration-200",
                    MATERIAL_VARIANTS[variant],
                    className
                )}
                {...props}
            />
        )
    }
)
Material.displayName = "Material"

export { Material }
