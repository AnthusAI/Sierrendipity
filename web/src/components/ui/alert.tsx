import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const alertVariants = cva("flex items-center gap-2 border-b px-4 py-2 text-sm", {
  variants: {
    variant: {
      info: "border-border bg-secondary text-secondary-foreground",
      warning: "border-border bg-warning-bg text-warning-fg",
      danger: "border-border bg-danger-bg text-danger-fg",
    },
  },
  defaultVariants: { variant: "info" },
});

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

/** A banner across the workspace. Give it `role="alert"` when it reports an error. */
export function Alert({ className, variant, ...props }: AlertProps) {
  return <div className={cn(alertVariants({ variant }), className)} {...props} />;
}
