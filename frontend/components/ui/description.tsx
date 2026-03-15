import * as React from "react"
import { cn } from "@/lib/utils"

export interface DescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> { }

const Description = React.forwardRef<HTMLParagraphElement, DescriptionProps>(
    ({ className, ...props }, ref) => {
        return (
            <p
                ref={ref}
                className={cn("text-[14px] text-ds-text-secondary leading-normal", className)}
                {...props}
            />
        )
    }
)
Description.displayName = "Description"

export { Description }