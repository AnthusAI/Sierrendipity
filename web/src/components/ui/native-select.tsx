import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A styled native <select>. The student-facing pickers (project, language, optimization) stay native
 * on purpose: they use the platform's own keyboard and touch behavior and work with assistive tech.
 */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, children, ...props }, ref) => (
    <span className="relative inline-flex items-center">
      <select
        ref={ref}
        className={cn(
          "h-8 cursor-pointer appearance-none rounded-md border border-input bg-background py-0 pl-3 pr-8 text-sm text-foreground outline-none transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2 size-4 text-muted-foreground" />
    </span>
  ),
);
NativeSelect.displayName = "NativeSelect";
