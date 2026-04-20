import { Loader2, Radar } from "lucide-react";
import { cn } from "@/components/ui/cn";

interface ViewLoadingProps {
  title: string;
  subtitle?: string;
  compact?: boolean;
  className?: string;
}

export function ViewLoading({
  title,
  subtitle,
  compact = false,
  className,
}: ViewLoadingProps) {
  return (
    <div
      className={cn(
        "w-full grid place-items-center",
        compact ? "py-10" : "h-full min-h-[280px]",
        className
      )}
    >
      <div className="surface-panel px-5 py-4 min-w-[260px] max-w-[420px]">
        <div className="fui-stripe mb-3" />
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-lg border border-edge-glow bg-cyan-glow flex items-center justify-center shrink-0">
            <Loader2 className="w-4 h-4 text-cyan-300 animate-spin" />
            <Radar className="w-2.5 h-2.5 text-cyan-200 absolute -top-1 -right-1 opacity-80" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight text-ink-bright">{title}</p>
            <p className="text-xs font-mono text-ink-muted mt-0.5">
              {subtitle ?? "Establishing view context and telemetry stream..."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
