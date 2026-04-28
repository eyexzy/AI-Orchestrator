"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  variant?: "default" | "vercel";
}

const TabsContext = React.createContext<TabsContextValue>({ value: "", onValueChange: () => { }, variant: "default" });

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  onValueChange: (value: string) => void;
  variant?: "default" | "vercel";
}

function Tabs({ value, onValueChange, variant = "default", className, children, ...props }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onValueChange, variant }}>
      <div className={cn("w-full", className)} {...props}>{children}</div>
    </TabsContext.Provider>
  );
}

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const ctx = React.useContext(TabsContext);
    return (
      <div
        ref={ref}
        className={cn(
          ctx.variant === "vercel"
            ? "flex w-full flex-nowrap items-baseline gap-4 overflow-x-auto border-b border-gray-alpha-200 scrollbar-none h-[36px]"
            : "inline-flex items-center rounded-lg bg-gray-alpha-100 p-0.5",
          className
        )}
        {...props}
      />
    );
  },
);
TabsList.displayName = "TabsList";

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, children, ...props }, ref) => {
    const ctx = React.useContext(TabsContext);
    const isActive = ctx.value === value;
    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        aria-selected={isActive}
        onClick={() => ctx.onValueChange(value)}
        className={cn(
          ctx.variant === "vercel"
            ? [
                "relative flex h-full items-center justify-center whitespace-nowrap px-1 text-[14px] transition-colors",
                isActive
                  ? "text-[var(--segmented-control-active-text)] font-medium"
                  : "text-[var(--segmented-control-inactive-text)] hover:text-[var(--segmented-control-active-text)]",
              ]
            : [
                "inline-flex items-center justify-center rounded-md px-3 py-1 text-sm font-medium transition-all duration-200",
                isActive ? "bg-gray-alpha-300 text-foreground shadow-sm" : "text-ds-text-secondary hover:text-foreground",
              ],
          className,
        )}
        {...props}
      >
        {children}
        {ctx.variant === "vercel" && isActive && (
          <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground" />
        )}
      </button>
    );
  },
);
TabsTrigger.displayName = "TabsTrigger";

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, ...props }, ref) => {
    const ctx = React.useContext(TabsContext);
    if (ctx.value !== value) return null;
    return <div ref={ref} role="tabpanel" className={cn("mt-0", className)} {...props} />;
  },
);
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };