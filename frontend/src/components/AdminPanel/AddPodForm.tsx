import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Loader2, ChevronDown } from "lucide-react";
import { podSchema, type PodFormData } from "@/schemas/network";
import { useCreatePod } from "@/api/queries";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/components/ui/cn";

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

export function AddPodForm({ onSuccess }: AddPodFormProps) {
  const { mutate: createPod, isPending, error } = useCreatePod();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<PodFormData>({
    resolver: zodResolver(podSchema),
    defaultValues: {
      device_type:  "arista_eos",
      ssh_username: "",
      ssh_password: "",
      description:  "",
    },
  });

  const onSubmit = (data: PodFormData) => {
    createPod(data as Parameters<typeof createPod>[0], {
      onSuccess: () => { reset(); onSuccess(); },
    });
  };

  return (
    <GlassCard elevated className="p-6 animate-fade-up">
      <h3 className="text-sm font-semibold text-ink-bright mb-5 flex items-center gap-2">
        <Plus className="w-4 h-4 text-cyan-400" />
        Add Device
      </h3>

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
            <input {...register("pod_name")} className="input-field" placeholder="Node 1 — Arista EOS" />
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
                <option value="arista_eos">Arista EOS</option>
                <option value="cisco_iosxe">Cisco IOS-XE</option>
                <option value="cisco_iosxr">Cisco IOS-XR</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
            </div>
          </Field>
        </div>

        {/* Row 3 */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="SSH Username" error={errors.ssh_username?.message}>
            <input {...register("ssh_username")} className="input-field" placeholder="required" />
          </Field>
          <Field label="SSH Password" error={errors.ssh_password?.message}>
            <input {...register("ssh_password")} className="input-field" type="password" placeholder="required" />
          </Field>
        </div>

        {/* Row 4 */}
        <Field label="Description (optional)" error={errors.description?.message}>
          <input {...register("description")} className="input-field" placeholder="Spine switch — rack A" />
        </Field>

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
            className={cn("btn-primary text-xs", isPending && "opacity-60")}
          >
            {isPending
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</>
              : <><Plus className="w-3.5 h-3.5" /> Create Node</>}
          </button>
        </div>
      </form>
    </GlassCard>
  );
}
