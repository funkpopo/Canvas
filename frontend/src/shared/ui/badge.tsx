import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border font-medium w-fit whitespace-nowrap shrink-0 transition-colors overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-error text-error-foreground hover:bg-error/90",
        outline: "border-border text-foreground hover:bg-accent hover:text-accent-foreground",
        success: "border-transparent bg-success text-success-foreground hover:bg-success/90",
        warning: "border-transparent bg-warning text-warning-foreground hover:bg-warning/90",
        info: "border-transparent bg-info text-info-foreground hover:bg-info/90",
        neutral: "border-transparent bg-badge-neutral text-badge-neutral-foreground hover:bg-badge-neutral/90",
        // 浅色变体 - 提供更好的可读性
        "success-light": "border-success/20 bg-success-light text-success-light-foreground hover:bg-success-light/80",
        "warning-light": "border-warning/20 bg-warning-light text-warning-light-foreground hover:bg-warning-light/80", 
        "error-light": "border-error/20 bg-error-light text-error-light-foreground hover:bg-error-light/80",
        "info-light": "border-info/20 bg-info-light text-info-light-foreground hover:bg-info-light/80",
        "neutral-light": "border-badge-neutral/20 bg-badge-neutral-light text-badge-neutral-light-foreground hover:bg-badge-neutral-light/80",
      },
      size: {
        sm: "px-1.5 py-0.5 text-[10px] gap-1 [&>svg]:size-2.5",
        default: "px-2 py-0.5 text-xs gap-1 [&>svg]:size-3",
        lg: "px-2.5 py-1 text-sm gap-1.5 [&>svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// 预设样式类 - 标准化常用组合
export const badgePresets = {
  status: "text-[10px] uppercase tracking-[0.3em] font-semibold",
  metric: "font-mono text-xs",
  tag: "text-xs",
  label: "text-[10px] uppercase tracking-[0.4em]",
} as const

function Badge({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
