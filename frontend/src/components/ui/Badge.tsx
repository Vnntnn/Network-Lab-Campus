import { cn } from "./cn";

type BadgeVariant = "default" | "cyan" | "matrix" | "crimson" | "pulse";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variants: Record<BadgeVariant, string> = {
  default: "tag",
  cyan: "tag tag-cyan",
  matrix: "tag tag-matrix",
  crimson: "tag tag-crimson",
  pulse: "tag border-pulse/30 bg-pulse/10 text-pulse",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span className={cn(variants[variant], className)}>{children}</span>
  );
}
