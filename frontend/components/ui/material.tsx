import * as React from "react"
import { cn } from "@/lib/utils"

export interface MaterialProps extends React.HTMLAttributes<HTMLElement> {
    as?: React.ElementType;
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
}

const Material = React.forwardRef<HTMLElement, MaterialProps>(
    ({ className, as: Component = "div", ...props }, ref) => {
        return (
            <Component
                ref={ref}
                className={cn(
                    "overflow-hidden rounded-lg bg-gray-alpha-100 shadow-geist-sm transition-[background-color] duration-200",
                    className
                )}
                {...props}
            />
        )
    }
)
Material.displayName = "Material"

export { Material }