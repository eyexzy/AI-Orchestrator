"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center h-5",
      className
    )}
    {...props}
  >
    {/* Track: 8px height, 5px radius per exact Vercel specs */}
    <SliderPrimitive.Track className="relative h-[8px] w-full grow overflow-hidden rounded-[5px] bg-[var(--ds-gray-alpha-200)] transform-gpu">
      <SliderPrimitive.Range className="absolute h-full bg-[var(--ds-blue-700)]" />
    </SliderPrimitive.Track>

    {/* Outer Thumb: Acts as a strict 6x14 layout anchor for Radix UI positioning. Never scales. */}
    <SliderPrimitive.Thumb className="group relative block h-[14px] w-[6px] outline-none cursor-grab active:cursor-grabbing">

      {/* Inner Visual: Handles white background, exact Vercel shadows, and scaling.
          Being 'absolute', its scaling doesn't affect the parent bounds, preventing Radix jitter. */}
      <div
        className="absolute inset-0 rounded-[1px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.15),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_0_0_1px_rgb(0,0,0),0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-200 ease-in-out transform-gpu group-hover:scale-125 group-active:scale-95 group-focus-visible:ring-4 group-focus-visible:ring-[var(--ds-gray-alpha-200)]"
      />

    </SliderPrimitive.Thumb>
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };