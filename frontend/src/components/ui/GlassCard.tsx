import { cn } from "./cn";
import type { HTMLAttributes } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  glow?: boolean;
}

export function GlassCard({
  className,
  elevated = false,
  glow = false,
  children,
  ...props
}: GlassCardProps) {
  return (
    <div
      className={cn(
        elevated ? "glass-elevated" : "glass",
        glow && "border-glow-cyan",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
