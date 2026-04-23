import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ChevronDown } from "lucide-react";
import { podSchema, type PodFormData } from "@/schemas/network";
import { useCreatePod, useIdentities } from "@/api/queries";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/components/ui/cn";
import { useState } from "react";
import { DeviceDiscoveryForm } from "./DeviceDiscoveryForm";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-ink-secondary">{label}</label>
      {children}
      {error && <p className="text-2xs text-crimson font-mono">{error}</p>}
    </div>
  );
}

interface AddPodFormProps {
  onSuccess: () => void;
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

export function AddPodForm({ onSuccess }: AddPodFormProps) {
  const { mutate: createPod, isPending, error } = useCreatePod();
  const { data: identities } = useIdentities();
  const [mode, setMode] = useState<"manual" | "discover">("discover");
  const [discoveredInfo, setDiscoveredInfo] = useState<DiscoveryResult | null>(null);
  const [identitySelection, setIdentitySelection] = useState<string>("");

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<PodFormData>({
    resolver: zodResolver(podSchema),
    defaultValues: {
      device_type:  "cisco_iosxe",
      connection_protocol: "telnet",
      ssh_username: "",
      ssh_password: "",
      description:  "",
    },
  });

  const podName = watch("pod_name");
  const protocol = watch("connection_protocol");

  const onSubmit = (data: PodFormData) => {
    const identityId = Number(identitySelection);
    createPod(
      {
        ...data,
        telnet_port: typeof data.telnet_port === "number" ? data.telnet_port : undefined,
        identity_id: Number.isFinite(identityId) && identityId > 0 ? identityId : null,
      },
      {
        onSuccess: () => {
          reset();
          setIdentitySelection("");
          setDiscoveredInfo(null);
          setMode("discover");
          onSuccess();
        },
      }
    );
  };

  const handleDiscoverySuccess = (result: DiscoveryResult) => {
    setDiscoveredInfo(result);
    // Auto-fill discovered information
    if (result.device_type) {
      const normalized = result.device_type as "arista_eos" | "cisco_iosxe" | "cisco_iosxr";
      setValue("device_type", normalized);
    }
    if (result.hostname && !podName) {
      setValue("pod_name", result.hostname);
    }
  };

  const handleDiscoveryError = () => {
    setDiscoveredInfo(null);
  };

  return (
    <GlassCard elevated className="p-6 animate-fade-up">
      <h3 className="text-sm font-semibold text-ink-bright mb-6">Add Device</h3>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-ink-muted/25">
        <button
          type="button"
          onClick={() => { setMode("discover"); }}
          className={cn(
            "px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors uppercase tracking-wide",
            mode === "discover"
              ? "border-cyan-400 text-cyan-400"
              : "border-transparent text-ink-secondary hover:text-ink-bright"
          )}
        >
          Auto-Discover
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={cn(
            "px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors uppercase tracking-wide",
            mode === "manual"
              ? "border-cyan-400 text-cyan-400"
              : "border-transparent text-ink-secondary hover:text-ink-bright"
          )}
        >
          Manual Entry
        </button>
      </div>

      {/* Discovery Mode */}
      {mode === "discover" && (
        <DeviceDiscoveryForm
          onDiscoverySuccess={handleDiscoverySuccess}
          onDiscoveryError={handleDiscoveryError}
        />
      )}

      {/* Manual Mode */}
      {mode === "manual" && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Row 1 */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Node Number" error={errors.pod_number?.message}>
              <input
                {...register("pod_number", { valueAsNumber: true })}
                className="input-field" type="number" min={1} max={50} placeholder="1"
              />
            </Field>
            <Field label="Node Name" error={errors.pod_name?.message}>
              <input {...register("pod_name")} className="input-field" placeholder="Node 1 — Cisco IOS-XE" />
            </Field>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Device IP" error={errors.device_ip?.message}>
              <input {...register("device_ip")} className="input-field" placeholder="192.168.100.11" />
            </Field>
            <Field label="Device Type" error={errors.device_type?.message}>
              <div className="relative">
                <select {...register("device_type")} className="input-field appearance-none pr-8">
                  <option value="cisco_iosxe">Cisco IOS-XE</option>
                  <option value="cisco_iosxr">Cisco IOS-XR</option>
                  <option value="arista_eos">Arista EOS</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
              </div>
            </Field>
          </div>

          {/* Row 3 */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Connection Protocol" error={errors.connection_protocol?.message}>
              <div className="relative">
                <select {...register("connection_protocol")} className="input-field appearance-none pr-8">
                  <option value="telnet">Telnet</option>
                  <option value="ssh">SSH</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
              </div>
            </Field>
            <Field label="Telnet Port (optional)" error={errors.telnet_port?.message}>
              <input {...register("telnet_port")} className="input-field" type="number" placeholder="23" />
            </Field>
          </div>

          <Field label="Credential Identity (optional)">
            <div className="relative">
              <select
                value={identitySelection}
                onChange={(event) => setIdentitySelection(event.target.value)}
                className="input-field appearance-none pr-8"
                title="Credential identity"
                aria-label="Credential identity"
              >
                <option value="">Use inline/default credentials</option>
                {(identities ?? []).map((identity) => (
                  <option key={identity.id} value={String(identity.id)}>
                    {identity.name}{identity.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
            </div>
          </Field>

          {/* Row 4 */}
          {protocol === "ssh" && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Username" error={errors.ssh_username?.message}>
                <input {...register("ssh_username")} className="input-field" placeholder="admin" />
              </Field>
              <Field label="Password" error={errors.ssh_password?.message}>
                <input {...register("ssh_password")} className="input-field" type="password" placeholder="••••••••" />
              </Field>
            </div>
          )}

          {protocol === "telnet" && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Username (optional)" error={errors.ssh_username?.message}>
                <input {...register("ssh_username")} className="input-field" placeholder="admin" />
              </Field>
              <Field label="Password (optional)" error={errors.ssh_password?.message}>
                <input {...register("ssh_password")} className="input-field" type="password" placeholder="••••••••" />
              </Field>
            </div>
          )}

          {/* Row 5 */}
          <div className="grid grid-cols-1 gap-4">
            <Field label="Description (optional)" error={errors.description?.message}>
              <input {...register("description")} className="input-field" placeholder="Spine switch — rack A" />
            </Field>
          </div>

          {error && (
            <p className="text-xs text-crimson font-mono bg-crimson/10 border border-crimson/25 rounded-lg px-3 py-2">
              {error.message}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => reset()} className="btn-ghost text-xs">
              Reset
            </button>
            <button
              type="submit"
              disabled={isPending}
              className={cn("btn-primary text-xs font-semibold uppercase tracking-wide", isPending && "opacity-60")}
            >
              {isPending
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</>
                : <>Create Node</>}
            </button>
          </div>
        </form>
      )}

      {/* Show form after discovery success */}
      {mode === "discover" && discoveredInfo?.success && (
        <>
          <hr className="my-6 border-ink-muted/25" />
          <p className="text-xs text-ink-secondary mb-4">✓ Device discovered. Complete the form below to save:</p>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Row 1 */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Node Number" error={errors.pod_number?.message}>
                <input
                  {...register("pod_number", { valueAsNumber: true })}
                  className="input-field" type="number" min={1} max={50} placeholder="1"
                />
              </Field>
              <Field label="Node Name" error={errors.pod_name?.message}>
                <input {...register("pod_name")} className="input-field" placeholder={discoveredInfo.hostname || "Node name"} />
              </Field>
            </div>

            {/* Row 2 */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Device IP" error={errors.device_ip?.message}>
                <input {...register("device_ip")} className="input-field" placeholder="192.168.100.11" />
              </Field>
              <Field label="Device Type" error={errors.device_type?.message}>
                <div className="relative">
                  <select {...register("device_type")} className="input-field appearance-none pr-8">
                    <option value="cisco_iosxe">Cisco IOS-XE</option>
                    <option value="cisco_iosxr">Cisco IOS-XR</option>
                    <option value="arista_eos">Arista EOS</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
                </div>
              </Field>
            </div>

            {/* Row 3 */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Connection Protocol" error={errors.connection_protocol?.message}>
                <div className="relative">
                  <select {...register("connection_protocol")} className="input-field appearance-none pr-8">
                    <option value="telnet">Telnet</option>
                    <option value="ssh">SSH</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
                </div>
              </Field>
              <Field label="Telnet Port (optional)" error={errors.telnet_port?.message}>
                <input {...register("telnet_port")} className="input-field" type="number" placeholder="23" />
              </Field>
            </div>

            <Field label="Credential Identity (optional)">
              <div className="relative">
                <select
                  value={identitySelection}
                  onChange={(event) => setIdentitySelection(event.target.value)}
                  className="input-field appearance-none pr-8"
                  title="Credential identity"
                  aria-label="Credential identity"
                >
                  <option value="">Use inline/default credentials</option>
                  {(identities ?? []).map((identity) => (
                    <option key={identity.id} value={String(identity.id)}>
                      {identity.name}{identity.is_default ? " (default)" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
              </div>
            </Field>

            {protocol === "ssh" && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Username" error={errors.ssh_username?.message}>
                  <input {...register("ssh_username")} className="input-field" placeholder="admin" />
                </Field>
                <Field label="Password" error={errors.ssh_password?.message}>
                  <input {...register("ssh_password")} className="input-field" type="password" placeholder="••••••••" />
                </Field>
              </div>
            )}

            {protocol === "telnet" && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Username (optional)" error={errors.ssh_username?.message}>
                  <input {...register("ssh_username")} className="input-field" placeholder="admin" />
                </Field>
                <Field label="Password (optional)" error={errors.ssh_password?.message}>
                  <input {...register("ssh_password")} className="input-field" type="password" placeholder="••••••••" />
                </Field>
              </div>
            )}

            {/* Row 4 */}
            <Field label="Description (optional)" error={errors.description?.message}>
              <input {...register("description")} className="input-field" placeholder="Discovered: Cisco device" />
            </Field>

            {error && (
              <p className="text-xs text-crimson font-mono bg-crimson/10 border border-crimson/25 rounded-lg px-3 py-2">
                {error.message}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setMode("discover")} className="btn-ghost text-xs">
                ← Back
              </button>
              <button
                type="submit"
                disabled={isPending}
                className={cn("btn-primary text-xs font-semibold uppercase tracking-wide", isPending && "opacity-60")}
              >
                {isPending
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</>
                  : <>Create Node</>}
              </button>
            </div>
          </form>
        </>
      )}
    </GlassCard>
  );
}
