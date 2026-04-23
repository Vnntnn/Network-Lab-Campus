import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ChevronDown } from "lucide-react";
import { deviceDiscoverySchema, type DeviceDiscoveryFormData } from "@/schemas/network";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/components/ui/cn";
import { useState } from "react";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-ink-secondary">{label}</label>
      {children}
      {error && <p className="text-2xs text-crimson font-mono">{error}</p>}
    </div>
  );
}

interface DiscoveryResult {
  success: boolean;
  device_type?: string;
  hostname?: string;
  model?: string;
  serial_number?: string;
  message: string;
  elapsed_ms: number;
}

interface DeviceDiscoveryFormProps {
  onDiscoverySuccess: (result: DiscoveryResult) => void;
  onDiscoveryError: (error: string) => void;
}

export function DeviceDiscoveryForm({ onDiscoverySuccess, onDiscoveryError }: DeviceDiscoveryFormProps) {
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<DiscoveryResult | null>(null);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<DeviceDiscoveryFormData>({
    resolver: zodResolver(deviceDiscoverySchema),
    defaultValues: {
      connection_protocol: "telnet",
      ssh_username: "",
      ssh_password: "",
    },
  });

  const protocol = watch("connection_protocol");

  const onSubmit = async (data: DeviceDiscoveryFormData) => {
    setIsDiscovering(true);
    setDiscoveryResult(null);

    try {
      const response = await fetch("/api/v1/pods/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result: DiscoveryResult = await response.json();
      setDiscoveryResult(result);

      if (result.success) {
        onDiscoverySuccess(result);
      } else {
        onDiscoveryError(result.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Discovery failed";
      onDiscoveryError(message);
      setDiscoveryResult({
        success: false,
        message,
        elapsed_ms: 0,
      });
    } finally {
      setIsDiscovering(false);
    }
  };

  return (
    <GlassCard elevated className="p-6 animate-fade-up">
      <h3 className="text-sm font-semibold text-ink-bright mb-6">Discover Device</h3>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Row 1: IP and Protocol */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Device IP" error={errors.device_ip?.message}>
            <input
              {...register("device_ip")}
              className="input-field"
              placeholder="192.168.100.11"
              disabled={isDiscovering}
            />
          </Field>
          <Field label="Connection Protocol" error={errors.connection_protocol?.message}>
            <div className="relative">
              <select
                {...register("connection_protocol")}
                className="input-field appearance-none pr-8"
                disabled={isDiscovering}
              >
                <option value="telnet">Telnet</option>
                <option value="ssh">SSH</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
            </div>
          </Field>
        </div>

        {/* Row 2: Credentials */}
        {protocol === "ssh" && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Username" error={errors.ssh_username?.message}>
              <input
                {...register("ssh_username")}
                className="input-field"
                placeholder="admin"
                disabled={isDiscovering}
              />
            </Field>
            <Field label="Password" error={errors.ssh_password?.message}>
              <input
                {...register("ssh_password")}
                className="input-field"
                type="password"
                placeholder="••••••••"
                disabled={isDiscovering}
              />
            </Field>
          </div>
        )}

        {protocol === "telnet" && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Username (optional)" error={errors.ssh_username?.message}>
              <input
                {...register("ssh_username")}
                className="input-field"
                placeholder="admin"
                disabled={isDiscovering}
              />
            </Field>
            <Field label="Password (optional)" error={errors.ssh_password?.message}>
              <input
                {...register("ssh_password")}
                className="input-field"
                type="password"
                placeholder="••••••••"
                disabled={isDiscovering}
              />
            </Field>
          </div>
        )}

        {/* Row 3: Optional Port */}
        <Field label="Port (optional)">
          <input
            {...register("port", { valueAsNumber: true })}
            className="input-field"
            type="number"
            placeholder="Auto (23 for Telnet, 22 for SSH)"
            disabled={isDiscovering}
          />
        </Field>

        {/* Discovery Result */}
        {discoveryResult && (
          <div
            className={cn(
              "rounded-lg border px-4 py-4 text-xs",
              discoveryResult.success
                ? "border-emerald-500/50 bg-emerald-500/10"
                : "border-crimson/50 bg-crimson/10"
            )}
          >
            <div className="space-y-3">
              <p className={cn("font-semibold", discoveryResult.success ? "text-emerald-300" : "text-crimson-300")}>
                {discoveryResult.success ? "✓ " : "✗ "}{discoveryResult.message}
              </p>
              {discoveryResult.success && (
                <div className="space-y-2 text-2xs text-ink-secondary">
                  {discoveryResult.hostname && (
                    <p><span className="font-semibold text-ink-bright">Hostname:</span> {discoveryResult.hostname}</p>
                  )}
                  {discoveryResult.device_type && (
                    <p><span className="font-semibold text-ink-bright">Type:</span> {discoveryResult.device_type}</p>
                  )}
                  {discoveryResult.model && (
                    <p><span className="font-semibold text-ink-bright">Model:</span> {discoveryResult.model}</p>
                  )}
                  {discoveryResult.serial_number && (
                    <p><span className="font-semibold text-ink-bright">Serial:</span> {discoveryResult.serial_number}</p>
                  )}
                  <p className="pt-1 opacity-75">Discovered in {discoveryResult.elapsed_ms.toFixed(0)}ms</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={isDiscovering}
            className={cn("btn-primary text-xs font-semibold uppercase tracking-wide", isDiscovering && "opacity-60")}
          >
            {isDiscovering
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Discovering…</>
              : <>Discover Device</>}
          </button>
        </div>
      </form>
    </GlassCard>
  );
}
