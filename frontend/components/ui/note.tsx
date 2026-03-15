import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const noteVariants = cva(
    "w-full rounded-md border p-4 text-[14px] leading-relaxed",
    {
        variants: {
            variant: {
                default: "border-gray-400 bg-background text-foreground",
                info: "border-blue-400 bg-blue-100 text-blue-900",
                warning: "border-amber-400 bg-amber-100 text-amber-900",
                error: "border-red-400 bg-red-100 text-red-900",
                success: "border-green-400 bg-green-100 text-green-900",
            },
            size: {
                default: "p-4",
                sm: "p-3 px-4 text-[13px]",
            }
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

export interface NoteProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof noteVariants> { }

function Note({ className, variant, size, ...props }: NoteProps) {
    return (
        <div className={cn(noteVariants({ variant, size }), className)} {...props} />
    )
}

export { Note, noteVariants }