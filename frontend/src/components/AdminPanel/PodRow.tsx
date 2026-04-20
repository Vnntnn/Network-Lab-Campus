import { useState } from "react";
import { Trash2, Wifi, Loader2, CheckCircle2, XCircle, Pencil, ChevronDown } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDeletePod, usePingPod, useUpdatePod, type LabPod } from "@/api/queries";
import { podSchema, type PodFormData } from "@/schemas/network";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";

const DEVICE_LABELS: Record<string, string> = {
  arista_eos:  "Arista EOS",
  cisco_iosxe: "Cisco IOS-XE",
  cisco_iosxr: "Cisco IOS-XR",
};

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-2xs font-medium text-ink-secondary">{label}</label>
      {children}
      {error && <p className="text-2xs text-crimson font-mono">{error}</p>}
    </div>
  );
}

interface PodRowProps {
  pod: LabPod;
  index: number;
}

export function PodRow({ pod, index }: PodRowProps) {
  const [editing,    setEditing]    = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const { mutate: ping,   isPending: pinging,  data: pingResult,  reset: resetPing  } = usePingPod();
  const { mutate: del,    isPending: deleting                                         } = useDeletePod();
  const { mutate: update, isPending: updating,  error: updateError                   } = useUpdatePod();

  const { register, handleSubmit, formState: { errors } } = useForm<PodFormData>({
    resolver: zodResolver(podSchema),
    defaultValues: {
      pod_number:   pod.pod_number,
      pod_name:     pod.pod_name,
      device_ip:    pod.device_ip,
      device_type:  pod.device_type,
      ssh_username: pod.ssh_username,
      ssh_password: pod.ssh_password,
      description:  pod.description,
    },
  });

  const onSave = (data: PodFormData) => {
    update({ id: pod.id, ...data }, { onSuccess: () => setEditing(false) });
  };

  return (
    <div
      className={cn(
        "rounded-xl border transition-all duration-200 overflow-hidden animate-fade-up",
        editing ? "border-edge-glow shadow-glow-cyan-sm" : "border-edge-dim hover:border-edge-subtle"
      )}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* ── Summary row ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-5 py-4 bg-surface">
        {/* Node number */}
        <div className="w-8 h-8 rounded-lg bg-depth border border-edge-subtle flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-mono font-bold text-cyan-400">{pod.pod_number}</span>
        </div>

        {/* Name + IP */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink-bright truncate">{pod.pod_name}</p>
          <p className="text-xs font-mono text-ink-muted">{pod.device_ip}</p>
        </div>

        {/* Type badge */}
        <Badge variant="cyan" className="hidden sm:inline-flex flex-shrink-0">
          {DEVICE_LABELS[pod.device_type] ?? pod.device_type}
        </Badge>

        {/* Ping status */}
        <div className="flex items-center gap-1.5 w-36 flex-shrink-0">
          {pinging && (
            <span className="flex items-center gap-1 text-2xs font-mono text-ink-muted">
              <Loader2 className="w-3 h-3 animate-spin" /> testing…
            </span>
          )}
          {!pinging && pingResult && (
            <span className={cn(
              "flex items-center gap-1 text-2xs font-mono",
              pingResult.reachable ? "text-matrix" : "text-crimson"
            )}>
              {pingResult.reachable
                ? <><CheckCircle2 className="w-3 h-3" /> {pingResult.elapsed_ms.toFixed(0)}ms</>
                : <><XCircle      className="w-3 h-3" /> unreachable</>}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => { resetPing(); ping(pod.id); }}
            disabled={pinging}
            className="btn-ghost text-xs py-1.5 px-2.5 gap-1"
            title="Test SSH connectivity"
          >
            <Wifi className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Test</span>
          </button>

          <button
            onClick={() => setEditing((v) => !v)}
            className={cn(
              "btn-ghost text-xs py-1.5 px-2.5 gap-1",
              editing && "border-edge-glow text-cyan-400"
            )}
          >
            <Pencil className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Edit</span>
          </button>

          {confirmDel ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => del(pod.id)}
                disabled={deleting}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-crimson text-void hover:bg-crimson/80 transition-colors"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirm"}
              </button>
              <button
                onClick={() => setConfirmDel(false)}
                className="px-2.5 py-1.5 rounded-lg text-xs text-ink-muted hover:text-ink-secondary transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDel(true)}
              className="btn-ghost text-xs py-1.5 px-2.5 gap-1 hover:border-crimson/40 hover:text-crimson"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Inline edit form ──────────────────────────────────────────── */}
      {editing && (
        <form
          onSubmit={handleSubmit(onSave)}
          className="px-5 py-4 border-t border-edge-dim bg-depth space-y-4 animate-fade-up"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Node Number" error={errors.pod_number?.message}>
              <input {...register("pod_number", { valueAsNumber: true })} className="input-field text-xs" type="number" />
            </Field>
            <Field label="Node Name" error={errors.pod_name?.message}>
              <input {...register("pod_name")} className="input-field text-xs" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Device IP" error={errors.device_ip?.message}>
              <input {...register("device_ip")} className="input-field text-xs" />
            </Field>
            <Field label="Device Type" error={errors.device_type?.message}>
              <div className="relative">
                <select {...register("device_type")} className="input-field text-xs appearance-none pr-8">
                  <option value="arista_eos">Arista EOS</option>
                  <option value="cisco_iosxe">Cisco IOS-XE</option>
                  <option value="cisco_iosxr">Cisco IOS-XR</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SSH Username" error={errors.ssh_username?.message}>
              <input {...register("ssh_username")} className="input-field text-xs" />
            </Field>
            <Field label="SSH Password" error={errors.ssh_password?.message}>
              <input {...register("ssh_password")} className="input-field text-xs" type="password" />
            </Field>
          </div>
          <Field label="Description" error={errors.description?.message}>
            <input {...register("description")} className="input-field text-xs" />
          </Field>

          {updateError && (
            <p className="text-2xs text-crimson font-mono">{updateError.message}</p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="btn-ghost text-xs">
              Cancel
            </button>
            <button type="submit" disabled={updating} className="btn-primary text-xs py-2">
              {updating
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                : "Save Changes"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
