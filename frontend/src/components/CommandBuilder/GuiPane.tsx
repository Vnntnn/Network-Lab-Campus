import { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  interfaceSchema, type InterfaceFormData,
  ospfSchema, type OspfFormData,
  vlanSchema, type VlanFormData,
  bgpSchema, type BgpFormData,
  staticRouteSchema, type StaticRouteFormData,
  systemSchema, type SystemFormData,
  eigrpSchema, type EigrpFormData,
  dhcpSchema, type DhcpFormData,
  aclSchema, type AclFormData,
  natSchema, type NatFormData,
  portChannelSchema, type PortChannelFormData,
  stpSchema, type StpFormData,
  vrfSchema, type VrfFormData,
  prefixListSchema, type PrefixListFormData,
  routeMapSchema, type RouteMapFormData,
  pbrSchema, type PbrFormData,
  qosSchema, type QosFormData,
  snmpSchema, type SnmpFormData,
  syslogSchema, type SyslogFormData,
  aaaSchema, type AaaFormData,
  sshSchema, type SshFormData,
} from "@/schemas/network";
import { cn } from "@/components/ui/cn";
import { type Feature } from "./verifyCommands";

// ── CLI generators ────────────────────────────────────────────────────────

function prefixToMask(prefix: number): string {
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return [
    (mask >> 24) & 255,
    (mask >> 16) & 255,
    (mask >> 8) & 255,
    mask & 255,
  ].join(".");
}

export function buildInterfaceCommands(d: InterfaceFormData, dt: string): string[] {
  const isArista = dt === "arista_eos";
  const cmds: string[] = [];
  const hasIp = d.ip_address && d.prefix_length;

  const ipLine = hasIp
    ? (isArista
        ? `   ip address ${d.ip_address}/${d.prefix_length}`
        : `   ip address ${d.ip_address} ${prefixToMask(d.prefix_length!)}`)
    : null;

  // ── SVI: interface Vlan N ─────────────────────────────────────────────
  if (d.mode === "svi") {
    cmds.push(`interface Vlan${d.interface_name}`);
    if (d.description) cmds.push(`   description ${d.description}`);
    if (ipLine) cmds.push(ipLine);
    cmds.push(d.shutdown ? "   shutdown" : "   no shutdown");
    cmds.push("!");
    return cmds;
  }

  // ── Sub-interface: dot1q encapsulation ───────────────────────────────
  if (d.mode === "subinterface") {
    cmds.push(`interface ${d.interface_name}`);
    if (d.description) cmds.push(`   description ${d.description}`);
    if (d.encap_vlan) {
      cmds.push(isArista
        ? `   encapsulation dot1q vlan ${d.encap_vlan}`
        : `   encapsulation dot1Q ${d.encap_vlan}`);
    }
    if (ipLine) cmds.push(ipLine);
    cmds.push(d.shutdown ? "   shutdown" : "   no shutdown");
    cmds.push("!");
    return cmds;
  }

  // ── Access port (L2) ─────────────────────────────────────────────────
  if (d.mode === "access") {
    cmds.push(`interface ${d.interface_name}`);
    if (d.description) cmds.push(`   description ${d.description}`);
    cmds.push("   switchport mode access");
    if (d.access_vlan) cmds.push(`   switchport access vlan ${d.access_vlan}`);
    cmds.push("   spanning-tree portfast");
    cmds.push(d.shutdown ? "   shutdown" : "   no shutdown");
    cmds.push("!");
    return cmds;
  }

  // ── Trunk port (L2) ──────────────────────────────────────────────────
  if (d.mode === "trunk") {
    cmds.push(`interface ${d.interface_name}`);
    if (d.description) cmds.push(`   description ${d.description}`);
    cmds.push("   switchport mode trunk");
    if (d.trunk_allowed_vlans) cmds.push(`   switchport trunk allowed vlan ${d.trunk_allowed_vlans}`);
    if (d.native_vlan) cmds.push(`   switchport trunk native vlan ${d.native_vlan}`);
    cmds.push(d.shutdown ? "   shutdown" : "   no shutdown");
    cmds.push("!");
    return cmds;
  }

  // ── Routed (default L3) ───────────────────────────────────────────────
  cmds.push(`interface ${d.interface_name}`);
  if (d.description) cmds.push(`   description ${d.description}`);
  // On Cisco switches, explicitly make the port routed
  if (!isArista) cmds.push("   no switchport");
  if (ipLine) cmds.push(ipLine);
  cmds.push(d.shutdown ? "   shutdown" : "   no shutdown");
  cmds.push("!");
  return cmds;
}

export function buildOspfCommands(d: OspfFormData, _dt: string): string[] {
  const cmds = [`router ospf ${d.process_id}`];
  if (d.router_id) cmds.push(`   router-id ${d.router_id}`);
  if (d.passive_default) cmds.push("   passive-interface default");
  for (const n of d.networks) cmds.push(`   network ${n.network} ${n.wildcard} area ${n.area}`);
  if (d.redistribute_connected) cmds.push("   redistribute connected subnets");
  cmds.push("!");
  return cmds;
}

export function buildVlanCommands(d: VlanFormData): string[] {
  return [`vlan ${d.vlan_id}`, `   name ${d.name}`, `   state ${d.state}`, "!"];
}

export function buildBgpCommands(d: BgpFormData, dt: string): string[] {
  const isArista = dt === "arista_eos";
  const cmds = [isArista ? `router bgp ${d.local_as}` : `router bgp ${d.local_as}`];
  if (d.router_id) cmds.push(`   bgp router-id ${d.router_id}`);
  for (const n of d.neighbors) {
    cmds.push(`   neighbor ${n.ip} remote-as ${n.remote_as}`);
    if (n.description) cmds.push(`   neighbor ${n.ip} description ${n.description}`);
    if (n.update_source) cmds.push(`   neighbor ${n.ip} update-source ${n.update_source}`);
    if (n.ebgp_multihop) cmds.push(`   neighbor ${n.ip} ebgp-multihop ${n.ebgp_multihop}`);
  }
  if (isArista) {
    cmds.push("   !");
    for (const net of d.networks) cmds.push(`   network ${net.prefix}/${net.prefix_length}`);
  } else {
    for (const net of d.networks)
      cmds.push(`   network ${net.prefix} mask ${prefixToMask(net.prefix_length)}`);
  }
  cmds.push("!");
  return cmds;
}

export function buildStaticRouteCommands(d: StaticRouteFormData, dt: string): string[] {
  const isArista = dt === "arista_eos";
  return d.routes.map((r) => {
    const base = isArista
      ? `ip route ${r.network}/${r.prefix_length} ${r.next_hop}`
      : `ip route ${r.network} ${prefixToMask(r.prefix_length)} ${r.next_hop}`;
    const ad = r.admin_distance ? ` ${r.admin_distance}` : "";
    const desc = r.description ? ` name ${r.description}` : "";
    return base + ad + desc;
  });
}

export function buildSystemCommands(d: SystemFormData, dt: string): string[] {
  const isArista = dt === "arista_eos";
  const cmds: string[] = [`hostname ${d.hostname}`];
  if (d.domain_name) {
    cmds.push(isArista ? `dns domain ${d.domain_name}` : `ip domain-name ${d.domain_name}`);
  }
  for (const s of d.dns_servers) {
    cmds.push(isArista ? `ip name-server ${s.ip}` : `ip name-server ${s.ip}`);
  }
  for (const s of d.ntp_servers) {
    cmds.push(isArista ? `ntp server ${s.ip}` : `ntp server ${s.ip}`);
  }
  if (d.banner_motd) {
    cmds.push(`banner motd ^`);
    cmds.push(d.banner_motd);
    cmds.push("^");
  }
  cmds.push("!");
  return cmds;
}

// ── Shared primitives ─────────────────────────────────────────────────────

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-ink-secondary">{label}</label>
      {children}
      {error && <p className="text-2xs text-crimson font-mono mt-0.5">{error}</p>}
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return <div className="section-label my-4">{label}</div>;
}

// ── Interface form ────────────────────────────────────────────────────────

const INTERFACE_MODES = [
  { value: "routed",       label: "Routed (L3)",    hint: "IP address on a physical port" },
  { value: "access",       label: "Access (L2)",    hint: "Switchport in a single VLAN" },
  { value: "trunk",        label: "Trunk (L2)",     hint: "Carries multiple VLANs" },
  { value: "svi",          label: "SVI (Vlan N)",   hint: "Layer-3 virtual VLAN interface" },
  { value: "subinterface", label: "Sub-interface",  hint: "dot1q encap on a physical port" },
] as const;

function ShutdownToggle({ register }: { register: ReturnType<typeof useForm<InterfaceFormData>>["register"] }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <div className="relative">
        <input {...register("shutdown")} type="checkbox" className="sr-only peer" />
        <div className="w-9 h-5 rounded-full bg-depth border border-edge-subtle peer-checked:bg-crimson/30 peer-checked:border-crimson/50 transition-colors" />
        <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-ink-muted peer-checked:translate-x-4 peer-checked:bg-crimson transition-all duration-200" />
      </div>
      <span className="text-xs text-ink-secondary">Shutdown interface</span>
    </label>
  );
}

function InterfaceForm({ deviceType, onCommands }: { deviceType: string; onCommands: (c: string[]) => void }) {
  const { register, watch, formState: { errors } } = useForm<InterfaceFormData>({
    resolver: zodResolver(interfaceSchema),
    defaultValues: { mode: "routed", prefix_length: 24, shutdown: false },
    mode: "onChange",
  });

  const mode = watch("mode");

  useEffect(() => {
    const sub = watch((values) => {
      const r = interfaceSchema.safeParse(values);
      onCommands(r.success ? buildInterfaceCommands(r.data, deviceType) : []);
    });
    return () => sub.unsubscribe();
  }, [watch, onCommands, deviceType]);

  const ifPlaceholder =
    mode === "svi"          ? "10 (→ interface Vlan10)"    :
    mode === "subinterface" ? (deviceType === "arista_eos" ? "Ethernet1.10" : "GigabitEthernet0/0.10") :
    deviceType === "arista_eos" ? "Ethernet1" : "GigabitEthernet0/0";

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <Field label="Interface Mode">
        <div className="grid grid-cols-5 gap-1.5">
          {INTERFACE_MODES.map((m) => (
            <label
              key={m.value}
              title={m.hint}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2 cursor-pointer text-center transition-colors",
                mode === m.value
                  ? "border-cyan-300/60 bg-cyan-300/10 text-cyan-200"
                  : "border-edge-subtle bg-void/50 text-ink-muted hover:border-edge-glow hover:text-ink-secondary"
              )}
            >
              <input {...register("mode")} type="radio" value={m.value} className="sr-only" />
              <span className="text-2xs font-mono leading-tight">{m.label}</span>
            </label>
          ))}
        </div>
      </Field>

      {/* Interface name */}
      <Field
        label={mode === "svi" ? "VLAN ID" : "Interface Name"}
        error={errors.interface_name?.message}
      >
        <input
          {...register("interface_name")}
          className="input-field"
          placeholder={ifPlaceholder}
        />
      </Field>

      {/* Description — all modes */}
      <Field label="Description (opt.)" error={errors.description?.message}>
        <input {...register("description")} className="input-field" placeholder="Uplink to core" />
      </Field>

      {/* ── Routed / SVI / Sub-interface: IP fields ── */}
      {(mode === "routed" || mode === "svi" || mode === "subinterface") && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="IP Address" error={errors.ip_address?.message}>
            <input {...register("ip_address")} className="input-field" placeholder="10.0.0.1" />
          </Field>
          <Field label="Prefix Length" error={errors.prefix_length?.message}>
            <input
              {...register("prefix_length", { valueAsNumber: true })}
              className="input-field" type="number" min={1} max={32} placeholder="24"
            />
          </Field>
        </div>
      )}

      {/* ── Sub-interface: encapsulation VLAN ── */}
      {mode === "subinterface" && (
        <Field label="Encapsulation VLAN (dot1q)" error={errors.encap_vlan?.message}>
          <input
            {...register("encap_vlan", { valueAsNumber: true })}
            className="input-field" type="number" min={1} max={4094} placeholder="10"
          />
        </Field>
      )}

      {/* ── Access port: VLAN ── */}
      {mode === "access" && (
        <Field label="Access VLAN" error={errors.access_vlan?.message}>
          <input
            {...register("access_vlan", { valueAsNumber: true })}
            className="input-field" type="number" min={1} max={4094} placeholder="100"
          />
        </Field>
      )}

      {/* ── Trunk port: allowed VLANs + native VLAN ── */}
      {mode === "trunk" && (
        <div className="space-y-3">
          <Field label="Allowed VLANs" error={errors.trunk_allowed_vlans?.message}>
            <input
              {...register("trunk_allowed_vlans")}
              className="input-field"
              placeholder="10,20,30-40"
            />
          </Field>
          <Field label="Native VLAN (opt.)" error={errors.native_vlan?.message}>
            <input
              {...register("native_vlan", { valueAsNumber: true })}
              className="input-field" type="number" min={1} max={4094} placeholder="1"
            />
          </Field>
        </div>
      )}

      <ShutdownToggle register={register} />
    </div>
  );
}

// ── OSPF form ─────────────────────────────────────────────────────────────

function OspfForm({ deviceType, onCommands }: { deviceType: string; onCommands: (c: string[]) => void }) {
  const { register, watch, control, formState: { errors } } = useForm<OspfFormData>({
    resolver: zodResolver(ospfSchema),
    defaultValues: { process_id: 1, networks: [{ network: "", wildcard: "0.0.0.0", area: 0 }], passive_default: false, redistribute_connected: false },
    mode: "onChange",
  });
  const { fields, append, remove } = useFieldArray({ control, name: "networks" });

  useEffect(() => {
    const sub = watch((values) => {
      const r = ospfSchema.safeParse(values);
      onCommands(r.success ? buildOspfCommands(r.data, deviceType) : []);
    });
    return () => sub.unsubscribe();
  }, [watch, onCommands, deviceType]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Process ID" error={errors.process_id?.message}>
          <input {...register("process_id", { valueAsNumber: true })} className="input-field" type="number" min={1} placeholder="1" />
        </Field>
        <Field label="Router ID (optional)" error={errors.router_id?.message}>
          <input {...register("router_id")} className="input-field" placeholder="1.1.1.1" />
        </Field>
      </div>
      <div className="flex gap-5">
        <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-ink-secondary">
          <input {...register("passive_default")} type="checkbox" className="accent-cyan-400" />
          Passive-interface default
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-ink-secondary">
          <input {...register("redistribute_connected")} type="checkbox" className="accent-cyan-400" />
          Redistribute connected
        </label>
      </div>
      <SectionDivider label="Networks" />
      {fields.map((field, i) => (
        <div key={field.id} className="flex items-start gap-2 animate-fade-up">
          <div className="flex-1 grid grid-cols-3 gap-2">
            <Field label="Network" error={errors.networks?.[i]?.network?.message}>
              <input {...register(`networks.${i}.network`)} className="input-field" placeholder="10.0.0.0" />
            </Field>
            <Field label="Wildcard" error={errors.networks?.[i]?.wildcard?.message}>
              <input {...register(`networks.${i}.wildcard`)} className="input-field" placeholder="0.0.0.255" />
            </Field>
            <Field label="Area" error={errors.networks?.[i]?.area?.message}>
              <input {...register(`networks.${i}.area`, { valueAsNumber: true })} className="input-field" type="number" min={0} placeholder="0" />
            </Field>
          </div>
          {fields.length > 1 && (
            <button type="button" onClick={() => remove(i)} title="Remove network" aria-label="Remove network" className="mt-6 p-2 rounded-lg text-ink-muted hover:text-crimson hover:bg-crimson/10 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => append({ network: "", wildcard: "0.0.0.0", area: 0 })} className="btn-ghost text-xs w-full">
        <Plus className="w-3.5 h-3.5" /> Add Network
      </button>
    </div>
  );
}

// ── VLAN form ─────────────────────────────────────────────────────────────

function VlanForm({ onCommands }: { onCommands: (c: string[]) => void }) {
  const { register, watch, formState: { errors } } = useForm<VlanFormData>({
    resolver: zodResolver(vlanSchema),
    defaultValues: { state: "active" },
    mode: "onChange",
  });

  useEffect(() => {
    const sub = watch((values) => {
      const r = vlanSchema.safeParse(values);
      onCommands(r.success ? buildVlanCommands(r.data) : []);
    });
    return () => sub.unsubscribe();
  }, [watch, onCommands]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="VLAN ID" error={errors.vlan_id?.message}>
          <input {...register("vlan_id", { valueAsNumber: true })} className="input-field" type="number" min={1} max={4094} placeholder="100" />
        </Field>
        <Field label="Name" error={errors.name?.message}>
          <input {...register("name")} className="input-field" placeholder="MGMT" />
        </Field>
      </div>
      <Field label="State" error={errors.state?.message}>
        <div className="relative">
          <select {...register("state")} className="input-field appearance-none pr-8">
            <option value="active">Active</option>
            <option value="suspend">Suspend</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
        </div>
      </Field>
    </div>
  );
}

// ── BGP form ──────────────────────────────────────────────────────────────

function BgpForm({ deviceType, onCommands }: { deviceType: string; onCommands: (c: string[]) => void }) {
  const { register, watch, control, formState: { errors } } = useForm<BgpFormData>({
    resolver: zodResolver(bgpSchema),
    defaultValues: { neighbors: [{ ip: "", remote_as: 65000 }], networks: [] },
    mode: "onChange",
  });
  const { fields: nFields, append: nAppend, remove: nRemove } = useFieldArray({ control, name: "neighbors" });
  const { fields: pFields, append: pAppend, remove: pRemove } = useFieldArray({ control, name: "networks" });

  useEffect(() => {
    const sub = watch((values) => {
      const r = bgpSchema.safeParse(values);
      onCommands(r.success ? buildBgpCommands(r.data, deviceType) : []);
    });
    return () => sub.unsubscribe();
  }, [watch, onCommands, deviceType]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Local AS" error={errors.local_as?.message}>
          <input {...register("local_as", { valueAsNumber: true })} className="input-field" type="number" placeholder="65001" />
        </Field>
        <Field label="BGP Router ID (opt.)" error={errors.router_id?.message}>
          <input {...register("router_id")} className="input-field" placeholder="1.1.1.1" />
        </Field>
      </div>

      <SectionDivider label="Neighbors" />
      {nFields.map((f, i) => (
        <div key={f.id} className="p-3 rounded-lg border border-edge-dim bg-depth space-y-3 animate-fade-up">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Neighbor IP" error={errors.neighbors?.[i]?.ip?.message}>
              <input {...register(`neighbors.${i}.ip`)} className="input-field" placeholder="10.0.0.2" />
            </Field>
            <Field label="Remote AS" error={errors.neighbors?.[i]?.remote_as?.message}>
              <input {...register(`neighbors.${i}.remote_as`, { valueAsNumber: true })} className="input-field" type="number" placeholder="65002" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Description (opt.)">
              <input {...register(`neighbors.${i}.description`)} className="input-field" placeholder="eBGP peer" />
            </Field>
            <Field label="Update Source (opt.)">
              <input {...register(`neighbors.${i}.update_source`)} className="input-field" placeholder="Loopback0" />
            </Field>
          </div>
          {nFields.length > 1 && (
            <button type="button" onClick={() => nRemove(i)} className="flex items-center gap-1 text-2xs text-crimson/70 hover:text-crimson transition-colors font-mono">
              <Trash2 className="w-3 h-3" /> Remove neighbor
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => nAppend({ ip: "", remote_as: 65000 })} className="btn-ghost text-xs w-full">
        <Plus className="w-3.5 h-3.5" /> Add Neighbor
      </button>

      <SectionDivider label="Advertised Networks" />
      {pFields.map((f, i) => (
        <div key={f.id} className="flex items-start gap-2 animate-fade-up">
          <div className="flex-1 grid grid-cols-2 gap-2">
            <Field label="Prefix" error={errors.networks?.[i]?.prefix?.message}>
              <input {...register(`networks.${i}.prefix`)} className="input-field" placeholder="10.0.1.0" />
            </Field>
            <Field label="Length" error={errors.networks?.[i]?.prefix_length?.message}>
              <input {...register(`networks.${i}.prefix_length`, { valueAsNumber: true })} className="input-field" type="number" min={0} max={32} placeholder="24" />
            </Field>
          </div>
          <button type="button" onClick={() => pRemove(i)} title="Remove advertised network" aria-label="Remove advertised network" className="mt-6 p-2 rounded-lg text-ink-muted hover:text-crimson hover:bg-crimson/10 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => pAppend({ prefix: "", prefix_length: 24 })} className="btn-ghost text-xs w-full">
        <Plus className="w-3.5 h-3.5" /> Advertise Network
      </button>
    </div>
  );
}

// ── Static Route form ─────────────────────────────────────────────────────

function StaticRouteForm({ deviceType, onCommands }: { deviceType: string; onCommands: (c: string[]) => void }) {
  const { register, watch, control, formState: { errors } } = useForm<StaticRouteFormData>({
    resolver: zodResolver(staticRouteSchema),
    defaultValues: { routes: [{ network: "", prefix_length: 0, next_hop: "" }] },
    mode: "onChange",
  });
  const { fields, append, remove } = useFieldArray({ control, name: "routes" });

  useEffect(() => {
    const sub = watch((values) => {
      const r = staticRouteSchema.safeParse(values);
      onCommands(r.success ? buildStaticRouteCommands(r.data, deviceType) : []);
    });
    return () => sub.unsubscribe();
  }, [watch, onCommands, deviceType]);

  return (
    <div className="space-y-3">
      {fields.map((f, i) => (
        <div key={f.id} className="p-3 rounded-lg border border-edge-dim bg-depth space-y-3 animate-fade-up">
          <div className="grid grid-cols-3 gap-2">
            <Field label="Network" error={errors.routes?.[i]?.network?.message}>
              <input {...register(`routes.${i}.network`)} className="input-field" placeholder="0.0.0.0" />
            </Field>
            <Field label="Prefix" error={errors.routes?.[i]?.prefix_length?.message}>
              <input {...register(`routes.${i}.prefix_length`, { valueAsNumber: true })} className="input-field" type="number" min={0} max={32} placeholder="0" />
            </Field>
            <Field label="Next Hop" error={errors.routes?.[i]?.next_hop?.message}>
              <input {...register(`routes.${i}.next_hop`)} className="input-field" placeholder="192.168.1.1" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Admin Distance (opt.)">
              <input {...register(`routes.${i}.admin_distance`, { valueAsNumber: true })} className="input-field" type="number" min={1} max={255} placeholder="1" />
            </Field>
            <Field label="Description (opt.)">
              <input {...register(`routes.${i}.description`)} className="input-field" placeholder="Default route" />
            </Field>
          </div>
          {fields.length > 1 && (
            <button type="button" onClick={() => remove(i)} className="flex items-center gap-1 text-2xs text-crimson/70 hover:text-crimson transition-colors font-mono">
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => append({ network: "", prefix_length: 0, next_hop: "" })} className="btn-ghost text-xs w-full">
        <Plus className="w-3.5 h-3.5" /> Add Route
      </button>
    </div>
  );
}

// ── System form ───────────────────────────────────────────────────────────

function SystemForm({ deviceType, onCommands }: { deviceType: string; onCommands: (c: string[]) => void }) {
  const { register, watch, control, formState: { errors } } = useForm<SystemFormData>({
    resolver: zodResolver(systemSchema),
    defaultValues: { ntp_servers: [], dns_servers: [] },
    mode: "onChange",
  });
  const { fields: ntpF, append: ntpAdd, remove: ntpRm } = useFieldArray({ control, name: "ntp_servers" });
  const { fields: dnsF, append: dnsAdd, remove: dnsRm } = useFieldArray({ control, name: "dns_servers" });

  useEffect(() => {
    const sub = watch((values) => {
      const r = systemSchema.safeParse(values);
      onCommands(r.success ? buildSystemCommands(r.data, deviceType) : []);
    });
    return () => sub.unsubscribe();
  }, [watch, onCommands, deviceType]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Hostname" error={errors.hostname?.message}>
          <input {...register("hostname")} className="input-field" placeholder="spine-01" />
        </Field>
        <Field label="Domain Name (opt.)" error={errors.domain_name?.message}>
          <input {...register("domain_name")} className="input-field" placeholder="lab.local" />
        </Field>
      </div>

      <SectionDivider label="NTP Servers" />
      {ntpF.map((f, i) => (
        <div key={f.id} className="flex items-start gap-2 animate-fade-up">
          <Field label={`NTP ${i + 1}`} error={(errors.ntp_servers?.[i] as { ip?: { message?: string } } | undefined)?.ip?.message}>
            <input {...register(`ntp_servers.${i}.ip`)} className="input-field" placeholder="216.239.35.4" />
          </Field>
          <button type="button" onClick={() => ntpRm(i)} title="Remove NTP server" aria-label="Remove NTP server" className="mt-6 p-2 rounded-lg text-ink-muted hover:text-crimson hover:bg-crimson/10 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => ntpAdd({ ip: "" })} className="btn-ghost text-xs w-full">
        <Plus className="w-3.5 h-3.5" /> Add NTP Server
      </button>

      <SectionDivider label="DNS Servers" />
      {dnsF.map((f, i) => (
        <div key={f.id} className="flex items-start gap-2 animate-fade-up">
          <Field label={`DNS ${i + 1}`} error={(errors.dns_servers?.[i] as { ip?: { message?: string } } | undefined)?.ip?.message}>
            <input {...register(`dns_servers.${i}.ip`)} className="input-field" placeholder="8.8.8.8" />
          </Field>
          <button type="button" onClick={() => dnsRm(i)} title="Remove DNS server" aria-label="Remove DNS server" className="mt-6 p-2 rounded-lg text-ink-muted hover:text-crimson hover:bg-crimson/10 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => dnsAdd({ ip: "" })} className="btn-ghost text-xs w-full">
        <Plus className="w-3.5 h-3.5" /> Add DNS Server
      </button>

      <SectionDivider label="Banner" />
      <Field label="MOTD Banner (opt.)" error={errors.banner_motd?.message}>
        <textarea
          {...register("banner_motd")}
          className="input-field font-mono resize-none h-20"
          placeholder={"Authorized access only.\nDisconnect immediately if not authorized."}
        />
      </Field>
    </div>
  );
}

// ── EIGRP form ────────────────────────────────────────────────────────────

export function buildEigrpCommands(d: EigrpFormData, dt: string): string[] {
  const isArista = dt === "arista_eos";
  const cmds: string[] = [];
  if (isArista) {
    cmds.push(`router eigrp ${d.as_number}`);
    if (d.router_id) cmds.push(`   router-id ${d.router_id}`);
    for (const n of d.networks) cmds.push(`   network ${n.network} ${n.wildcard}`);
    if (d.passive_default) cmds.push("   passive-interface default");
    if (!d.auto_summary) cmds.push("   no auto-summary");
  } else {
    cmds.push(`router eigrp ${d.as_number}`);
    if (d.router_id) cmds.push(`   eigrp router-id ${d.router_id}`);
    for (const n of d.networks) cmds.push(`   network ${n.network} ${n.wildcard}`);
    if (d.passive_default) cmds.push("   passive-interface default");
    if (!d.auto_summary) cmds.push("   no auto-summary");
  }
  cmds.push("!");
  return cmds;
}

function EigrpFormInner({ deviceType, onCommands }: { deviceType: string; onCommands: (c: string[]) => void }) {
  const { register, watch, control, formState: { errors } } = useForm<EigrpFormData>({
    resolver: zodResolver(eigrpSchema),
    defaultValues: { as_number: 100, networks: [{ network: "", wildcard: "0.0.0.255" }], auto_summary: false, passive_default: false },
    mode: "onChange",
  });
  const { fields, append, remove } = useFieldArray({ control, name: "networks" });

  useEffect(() => {
    const sub = watch((values) => {
      const r = eigrpSchema.safeParse(values);
      onCommands(r.success ? buildEigrpCommands(r.data, deviceType) : []);
    });
    return () => sub.unsubscribe();
  }, [watch, onCommands, deviceType]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="AS Number" error={errors.as_number?.message}>
          <input {...register("as_number", { valueAsNumber: true })} className="input-field" type="number" min={1} placeholder="100" />
        </Field>
        <Field label="Router ID (opt.)" error={errors.router_id?.message}>
          <input {...register("router_id")} className="input-field" placeholder="1.1.1.1" />
        </Field>
      </div>
      <div className="flex gap-6">
        <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-ink-secondary">
          <input {...register("auto_summary")} type="checkbox" className="accent-cyan-400" />
          Auto Summary
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-ink-secondary">
          <input {...register("passive_default")} type="checkbox" className="accent-cyan-400" />
          Passive-Interface Default
        </label>
      </div>
      <SectionDivider label="Networks" />
      {fields.map((f, i) => (
        <div key={f.id} className="flex items-start gap-2 animate-fade-up">
          <div className="flex-1 grid grid-cols-2 gap-2">
            <Field label="Network" error={errors.networks?.[i]?.network?.message}>
              <input {...register(`networks.${i}.network`)} className="input-field" placeholder="10.0.0.0" />
            </Field>
            <Field label="Wildcard" error={errors.networks?.[i]?.wildcard?.message}>
              <input {...register(`networks.${i}.wildcard`)} className="input-field" placeholder="0.0.0.255" />
            </Field>
          </div>
          {fields.length > 1 && (
            <button type="button" onClick={() => remove(i)} title="Remove network" aria-label="Remove network" className="mt-6 p-2 rounded-lg text-ink-muted hover:text-crimson hover:bg-crimson/10 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => append({ network: "", wildcard: "0.0.0.255" })} className="btn-ghost text-xs w-full">
        <Plus className="w-3.5 h-3.5" /> Add Network
      </button>
    </div>
  );
}

function EigrpForm({ deviceType, onCommands }: { deviceType: string; onCommands: (c: string[]) => void }) {
  if (deviceType === "arista_eos") {
    return (
      <div className="rounded-xl border border-amber-400/30 bg-amber-400/8 p-4 space-y-2">
        <p className="text-xs font-semibold text-amber-300">EIGRP not supported on Arista EOS</p>
        <p className="text-2xs text-ink-muted">
          Arista EOS does not implement EIGRP. Use OSPF or BGP for dynamic routing on this device.
        </p>
      </div>
    );
  }
  return <EigrpFormInner deviceType={deviceType} onCommands={onCommands} />;
}

// ── DHCP form ─────────────────────────────────────────────────────────────

export function buildDhcpCommands(d: DhcpFormData, dt: string): string[] {
  const isArista = dt === "arista_eos";
  const cmds: string[] = [];
  if (isArista) {
    cmds.push(`ip dhcp pool ${d.pool_name}`);
    cmds.push(`   network ${d.network}/${d.prefix_length}`);
    if (d.default_router) cmds.push(`   default-router ${d.default_router}`);
    if (d.dns_server) cmds.push(`   dns-server ${d.dns_server}`);
    cmds.push(`   lease ${d.lease_days}`);
    cmds.push("!");
    for (const ex of d.exclusions) {
      cmds.push(`ip dhcp excluded-address ${ex.start} ${ex.end}`);
    }
  } else {
    for (const ex of d.exclusions) {
      cmds.push(`ip dhcp excluded-address ${ex.start} ${ex.end}`);
    }
    cmds.push(`ip dhcp pool ${d.pool_name}`);
    cmds.push(`   network ${d.network} ${prefixToMask(d.prefix_length)}`);
    if (d.default_router) cmds.push(`   default-router ${d.default_router}`);
    if (d.dns_server) cmds.push(`   dns-server ${d.dns_server}`);
    cmds.push(`   lease ${d.lease_days}`);
    cmds.push("!");
  }
  return cmds;
}

function DhcpForm({ deviceType, onCommands }: { deviceType: string; onCommands: (c: string[]) => void }) {
  const { register, watch, control, formState: { errors } } = useForm<DhcpFormData>({
    resolver: zodResolver(dhcpSchema),
    defaultValues: { prefix_length: 24, lease_days: 1, exclusions: [] },
    mode: "onChange",
  });
  const { fields, append, remove } = useFieldArray({ control, name: "exclusions" });

  useEffect(() => {
    const sub = watch((values) => {
      const r = dhcpSchema.safeParse(values);
      onCommands(r.success ? buildDhcpCommands(r.data, deviceType) : []);
    });
    return () => sub.unsubscribe();
  }, [watch, onCommands, deviceType]);

  return (
    <div className="space-y-4">
      <Field label="Pool Name" error={errors.pool_name?.message}>
        <input {...register("pool_name")} className="input-field" placeholder="LAN_POOL" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Network" error={errors.network?.message}>
          <input {...register("network")} className="input-field" placeholder="192.168.1.0" />
        </Field>
        <Field label="Prefix Length" error={errors.prefix_length?.message}>
          <input {...register("prefix_length", { valueAsNumber: true })} className="input-field" type="number" min={1} max={32} placeholder="24" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Default Router (opt.)" error={errors.default_router?.message}>
          <input {...register("default_router")} className="input-field" placeholder="192.168.1.1" />
        </Field>
        <Field label="DNS Server (opt.)" error={errors.dns_server?.message}>
          <input {...register("dns_server")} className="input-field" placeholder="8.8.8.8" />
        </Field>
      </div>
      <Field label="Lease (days)" error={errors.lease_days?.message}>
        <input {...register("lease_days", { valueAsNumber: true })} className="input-field" type="number" min={0} max={365} placeholder="1" />
      </Field>
      <SectionDivider label="Excluded Ranges" />
      {fields.map((f, i) => (
        <div key={f.id} className="flex items-start gap-2 animate-fade-up">
          <div className="flex-1 grid grid-cols-2 gap-2">
            <Field label="Start IP">
              <input {...register(`exclusions.${i}.start`)} className="input-field" placeholder="192.168.1.1" />
            </Field>
            <Field label="End IP">
              <input {...register(`exclusions.${i}.end`)} className="input-field" placeholder="192.168.1.10" />
            </Field>
          </div>
          <button type="button" onClick={() => remove(i)} title="Remove route" aria-label="Remove route" className="mt-6 p-2 rounded-lg text-ink-muted hover:text-crimson hover:bg-crimson/10 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => append({ start: "", end: "" })} className="btn-ghost text-xs w-full">
        <Plus className="w-3.5 h-3.5" /> Add Exclusion
      </button>
    </div>
  );
}

// ── ACL form ──────────────────────────────────────────────────────────────

export function buildAclCommands(d: AclFormData): string[] {
  const cmds: string[] = [];
  if (d.acl_type === "standard") {
    cmds.push(`ip access-list standard ${d.acl_id}`);
    for (const e of d.entries) cmds.push(`   ${e.action} ${e.source}`);
  } else {
    cmds.push(`ip access-list extended ${d.acl_id}`);
    for (const e of d.entries) {
      const proto = e.protocol ?? "ip";
      const dst = e.destination ? ` ${e.destination}` : " any";
      const dport = e.dst_port ? ` eq ${e.dst_port}` : "";
      cmds.push(`   ${e.action} ${proto} ${e.source}${dst}${dport}`);
    }
  }
  cmds.push("!");
  return cmds;
}

function AclForm({ deviceType, onCommands }: { deviceType: string; onCommands: (c: string[]) => void }) {
  const { register, watch, control, formState: { errors } } = useForm<AclFormData>({
    resolver: zodResolver(aclSchema),
    defaultValues: { acl_type: "standard", entries: [{ action: "permit", source: "any" }] },
    mode: "onChange",
  });
  const { fields, append, remove } = useFieldArray({ control, name: "entries" });
  const aclType = watch("acl_type");

  useEffect(() => {
    const sub = watch((values) => {
      const r = aclSchema.safeParse(values);
      onCommands(r.success ? buildAclCommands(r.data) : []);
    });
    return () => sub.unsubscribe();
  }, [watch, onCommands, deviceType]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" error={errors.acl_type?.message}>
          <div className="relative">
            <select {...register("acl_type")} className="input-field appearance-none pr-8">
              <option value="standard">Standard</option>
              <option value="extended">Extended</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
          </div>
        </Field>
        <Field label="ACL Name / Number" error={errors.acl_id?.message}>
          <input {...register("acl_id")} className="input-field" placeholder="BLOCK_TELNET" />
        </Field>
      </div>
      <SectionDivider label="Entries (top-down)" />
      {fields.map((f, i) => (
        <div key={f.id} className="p-3 rounded-lg border border-edge-dim bg-depth space-y-2 animate-fade-up">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Action">
              <div className="relative">
                <select {...register(`entries.${i}.action`)} className="input-field appearance-none pr-8">
                  <option value="permit">permit</option>
                  <option value="deny">deny</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
              </div>
            </Field>
            <Field label="Source">
              <input {...register(`entries.${i}.source`)} className="input-field" placeholder="any / 10.0.0.0 0.0.0.255" />
            </Field>
          </div>
          {aclType === "extended" && (
            <div className="grid grid-cols-3 gap-2">
              <Field label="Protocol">
                <div className="relative">
                  <select {...register(`entries.${i}.protocol`)} className="input-field appearance-none pr-8">
                    <option value="ip">ip</option>
                    <option value="tcp">tcp</option>
                    <option value="udp">udp</option>
                    <option value="icmp">icmp</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
                </div>
              </Field>
              <Field label="Destination">
                <input {...register(`entries.${i}.destination`)} className="input-field" placeholder="any" />
              </Field>
              <Field label="Dst Port (opt.)">
                <input {...register(`entries.${i}.dst_port`)} className="input-field" placeholder="80" />
              </Field>
            </div>
          )}
          {fields.length > 1 && (
            <button type="button" onClick={() => remove(i)} className="flex items-center gap-1 text-2xs text-crimson/70 hover:text-crimson transition-colors font-mono">
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => append({ action: "permit", source: "any" })} className="btn-ghost text-xs w-full">
        <Plus className="w-3.5 h-3.5" /> Add Entry
      </button>
    </div>
  );
}

// ── NAT form ──────────────────────────────────────────────────────────────

export function buildNatCommands(d: NatFormData): string[] {
  const cmds: string[] = [];
  cmds.push(`interface ${d.inside_interface}`, "   ip nat inside", "!");
  cmds.push(`interface ${d.outside_interface}`, "   ip nat outside", "!");
  if (d.nat_type === "static" && d.local_ip && d.global_ip) {
    cmds.push(`ip nat inside source static ${d.local_ip} ${d.global_ip}`);
  } else if (d.nat_type === "dynamic" && d.acl_name && d.pool_name && d.pool_start && d.pool_end) {
    const poolMask = d.pool_prefix ? prefixToMask(d.pool_prefix) : "255.255.255.0";
    cmds.push(`ip nat pool ${d.pool_name} ${d.pool_start} ${d.pool_end} netmask ${poolMask}`);
    cmds.push(`ip nat inside source list ${d.acl_name} pool ${d.pool_name}`);
  } else if (d.nat_type === "overload" && d.acl_name) {
    cmds.push(`ip nat inside source list ${d.acl_name} interface ${d.outside_interface} overload`);
  }
  cmds.push("!");
  return cmds;
}

function NatForm({ deviceType, onCommands }: { deviceType: string; onCommands: (c: string[]) => void }) {
  const { register, watch, formState: { errors } } = useForm<NatFormData>({
    resolver: zodResolver(natSchema),
    defaultValues: { nat_type: "overload" },
    mode: "onChange",
  });
  const natType = watch("nat_type");

  useEffect(() => {
    const sub = watch((values) => {
      const r = natSchema.safeParse(values);
      onCommands(r.success ? buildNatCommands(r.data) : []);
    });
    return () => sub.unsubscribe();
  }, [watch, onCommands, deviceType]);

  return (
    <div className="space-y-4">
      <Field label="NAT Type" error={errors.nat_type?.message}>
        <div className="relative">
          <select {...register("nat_type")} className="input-field appearance-none pr-8">
            <option value="static">Static</option>
            <option value="dynamic">Dynamic Pool</option>
            <option value="overload">PAT / Overload</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Inside Interface" error={errors.inside_interface?.message}>
          <input {...register("inside_interface")} className="input-field" placeholder="GigabitEthernet0/0" />
        </Field>
        <Field label="Outside Interface" error={errors.outside_interface?.message}>
          <input {...register("outside_interface")} className="input-field" placeholder="GigabitEthernet0/1" />
        </Field>
      </div>
      {natType === "static" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Local IP" error={errors.local_ip?.message}>
            <input {...register("local_ip")} className="input-field" placeholder="192.168.1.10" />
          </Field>
          <Field label="Global IP" error={errors.global_ip?.message}>
            <input {...register("global_ip")} className="input-field" placeholder="203.0.113.5" />
          </Field>
        </div>
      )}
      {natType === "dynamic" && (
        <>
          <Field label="ACL Name" error={errors.acl_name?.message}>
            <input {...register("acl_name")} className="input-field" placeholder="LAN_ACL" />
          </Field>
          <Field label="Pool Name" error={errors.pool_name?.message}>
            <input {...register("pool_name")} className="input-field" placeholder="NAT_POOL" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Pool Start" error={errors.pool_start?.message}>
              <input {...register("pool_start")} className="input-field" placeholder="203.0.113.10" />
            </Field>
            <Field label="Pool End" error={errors.pool_end?.message}>
              <input {...register("pool_end")} className="input-field" placeholder="203.0.113.20" />
            </Field>
            <Field label="Pool Prefix" error={errors.pool_prefix?.message}>
              <input {...register("pool_prefix", { valueAsNumber: true })} className="input-field" type="number" min={1} max={32} placeholder="24" />
            </Field>
          </div>
        </>
      )}
      {natType === "overload" && (
        <Field label="ACL Name" error={errors.acl_name?.message}>
          <input {...register("acl_name")} className="input-field" placeholder="LAN_ACL" />
        </Field>
      )}
    </div>
  );
}

// ── Port-Channel form ─────────────────────────────────────────────────────

export function buildPortChannelCommands(d: PortChannelFormData, dt: string): string[] {
  const isArista = dt === "arista_eos";
  const cmds: string[] = [];
  for (const iface of d.interfaces) {
    cmds.push(`interface ${iface.name}`);
    if (isArista) {
      cmds.push(`   channel-group ${d.channel_id} mode ${d.mode}`);
    } else {
      cmds.push(`   channel-group ${d.channel_id} mode ${d.mode}`);
    }
    cmds.push("!");
  }
  cmds.push(isArista ? `interface Port-Channel${d.channel_id}` : `interface Port-channel${d.channel_id}`);
  if (d.description) cmds.push(`   description ${d.description}`);
  if (d.ip_address && d.prefix_length) {
    cmds.push(isArista
      ? `   ip address ${d.ip_address}/${d.prefix_length}`
      : `   ip address ${d.ip_address} ${prefixToMask(d.prefix_length)}`);
  }
  cmds.push("   no shutdown", "!");
  return cmds;
}

function PortChannelForm({ deviceType, onCommands }: { deviceType: string; onCommands: (c: string[]) => void }) {
  const { register, watch, control, formState: { errors } } = useForm<PortChannelFormData>({
    resolver: zodResolver(portChannelSchema),
    defaultValues: { channel_id: 1, mode: "active", interfaces: [{ name: "" }] },
    mode: "onChange",
  });
  const { fields, append, remove } = useFieldArray({ control, name: "interfaces" });

  useEffect(() => {
    const sub = watch((values) => {
      const r = portChannelSchema.safeParse(values);
      onCommands(r.success ? buildPortChannelCommands(r.data, deviceType) : []);
    });
    return () => sub.unsubscribe();
  }, [watch, onCommands, deviceType]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Channel ID" error={errors.channel_id?.message}>
          <input {...register("channel_id", { valueAsNumber: true })} className="input-field" type="number" min={1} max={256} placeholder="1" />
        </Field>
        <Field label="LACP Mode" error={errors.mode?.message}>
          <div className="relative">
            <select {...register("mode")} className="input-field appearance-none pr-8">
              <option value="active">active (LACP)</option>
              <option value="passive">passive (LACP)</option>
              <option value="on">on (static)</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
          </div>
        </Field>
      </div>
      <Field label="Description (opt.)" error={errors.description?.message}>
        <input {...register("description")} className="input-field" placeholder="Uplink to core" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="IP Address (opt.)" error={errors.ip_address?.message}>
          <input {...register("ip_address")} className="input-field" placeholder="10.0.0.1" />
        </Field>
        <Field label="Prefix Length" error={errors.prefix_length?.message}>
          <input {...register("prefix_length", { valueAsNumber: true })} className="input-field" type="number" min={1} max={32} placeholder="30" />
        </Field>
      </div>
      <SectionDivider label="Member Interfaces" />
      {fields.map((f, i) => (
        <div key={f.id} className="flex items-start gap-2 animate-fade-up">
          <Field label={`Interface ${i + 1}`} error={(errors.interfaces?.[i] as { name?: { message?: string } } | undefined)?.name?.message}>
            <input {...register(`interfaces.${i}.name`)} className="input-field" placeholder="GigabitEthernet0/1" />
          </Field>
          {fields.length > 1 && (
            <button type="button" onClick={() => remove(i)} title="Remove tunnel interface" aria-label="Remove tunnel interface" className="mt-6 p-2 rounded-lg text-ink-muted hover:text-crimson hover:bg-crimson/10 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => append({ name: "" })} className="btn-ghost text-xs w-full">
        <Plus className="w-3.5 h-3.5" /> Add Interface
      </button>
    </div>
  );
}

// ── STP form ──────────────────────────────────────────────────────────────

export function buildStpCommands(d: StpFormData, dt: string): string[] {
  const isArista = dt === "arista_eos";
  const cmds: string[] = [];
  // Arista does not support pvst — map to rapid-pvst
  const mode = (isArista && d.mode === "pvst") ? "rapid-pvst" : d.mode;
  // Arista uses "mstp" keyword, Cisco uses "mst"
  const modeWord = isArista && mode === "mst" ? "mstp" : mode;
  cmds.push(`spanning-tree mode ${modeWord}`);
  const vlan = d.vlan_id ?? 1;
  cmds.push(`spanning-tree vlan ${vlan} priority ${d.priority}`);
  for (const iface of d.portfast_interfaces) {
    cmds.push(`interface ${iface.name}`);
    cmds.push("   spanning-tree portfast");
    cmds.push("!");
  }
  for (const iface of d.bpduguard_interfaces) {
    cmds.push(`interface ${iface.name}`);
    cmds.push("   spanning-tree bpduguard enable");
    cmds.push("!");
  }
  return cmds;
}

function StpForm({ deviceType, onCommands }: { deviceType: string; onCommands: (c: string[]) => void }) {
  const isArista = deviceType === "arista_eos";
  const { register, watch, control, formState: { errors } } = useForm<StpFormData>({
    resolver: zodResolver(stpSchema),
    defaultValues: { mode: "rapid-pvst", priority: 32768, portfast_interfaces: [], bpduguard_interfaces: [] },
    mode: "onChange",
  });
  const { fields: pfF, append: pfAdd, remove: pfRm } = useFieldArray({ control, name: "portfast_interfaces" });
  const { fields: bgF, append: bgAdd, remove: bgRm } = useFieldArray({ control, name: "bpduguard_interfaces" });

  useEffect(() => {
    const sub = watch((values) => {
      const r = stpSchema.safeParse(values);
      onCommands(r.success ? buildStpCommands(r.data, deviceType) : []);
    });
    return () => sub.unsubscribe();
  }, [watch, onCommands, deviceType]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Mode" error={errors.mode?.message}>
          <div className="relative">
            <select {...register("mode")} className="input-field appearance-none pr-8">
              {/* pvst is Cisco-only */}
              {!isArista && <option value="pvst">PVST+</option>}
              <option value="rapid-pvst">Rapid PVST+</option>
              <option value="mst">{isArista ? "MSTP" : "MST"}</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
          </div>
        </Field>
        <Field label="VLAN ID (opt.)" error={errors.vlan_id?.message}>
          <input {...register("vlan_id", { valueAsNumber: true })} className="input-field" type="number" min={1} max={4094} placeholder="1" />
        </Field>
        <Field label="Priority" error={errors.priority?.message}>
          <input {...register("priority", { valueAsNumber: true })} className="input-field" type="number" min={0} max={61440} step={4096} placeholder="32768" />
        </Field>
      </div>

      <SectionDivider label="PortFast Interfaces" />
      {pfF.map((f, i) => (
        <div key={f.id} className="flex items-start gap-2 animate-fade-up">
          <Field label={`Interface ${i + 1}`}>
            <input {...register(`portfast_interfaces.${i}.name`)} className="input-field" placeholder="GigabitEthernet0/1" />
          </Field>
          <button type="button" onClick={() => pfRm(i)} title="Remove PortFast interface" aria-label="Remove PortFast interface" className="mt-6 p-2 rounded-lg text-ink-muted hover:text-crimson hover:bg-crimson/10 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => pfAdd({ name: "" })} className="btn-ghost text-xs w-full">
        <Plus className="w-3.5 h-3.5" /> Add PortFast Interface
      </button>

      <SectionDivider label="BPDUGuard Interfaces" />
      {bgF.map((f, i) => (
        <div key={f.id} className="flex items-start gap-2 animate-fade-up">
          <Field label={`Interface ${i + 1}`}>
            <input {...register(`bpduguard_interfaces.${i}.name`)} className="input-field" placeholder="GigabitEthernet0/2" />
          </Field>
          <button type="button" onClick={() => bgRm(i)} title="Remove BPDUGuard interface" aria-label="Remove BPDUGuard interface" className="mt-6 p-2 rounded-lg text-ink-muted hover:text-crimson hover:bg-crimson/10 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => bgAdd({ name: "" })} className="btn-ghost text-xs w-full">
        <Plus className="w-3.5 h-3.5" /> Add BPDUGuard Interface
      </button>
    </div>
  );
}

// ── VRF-Lite form ────────────────────────────────────────────────────────

export function buildVrfCommands(d: VrfFormData, dt: string): string[] {
  const isArista = dt === "arista_eos";
  const cmds: string[] = [];

  if (isArista) {
    cmds.push(`vrf instance ${d.name}`);
    cmds.push(`   rd ${d.rd}`);
    for (const rt of d.import_rts) cmds.push(`   route-target import ${rt.rt}`);
    for (const rt of d.export_rts) cmds.push(`   route-target export ${rt.rt}`);
    cmds.push("!");
    for (const intf of d.interfaces) {
      cmds.push(`interface ${intf.name}`);
      cmds.push(`   vrf ${d.name}`);
      cmds.push("!");
    }
    return cmds;
  }

  cmds.push(`vrf definition ${d.name}`);
  cmds.push(`   rd ${d.rd}`);
  for (const rt of d.import_rts) cmds.push(`   route-target import ${rt.rt}`);
  for (const rt of d.export_rts) cmds.push(`   route-target export ${rt.rt}`);
  cmds.push("   address-family ipv4");
  cmds.push("   exit-address-family");
  cmds.push("!");
  for (const intf of d.interfaces) {
    cmds.push(`interface ${intf.name}`);
    cmds.push(`   vrf forwarding ${d.name}`);
    cmds.push("!");
  }
  return cmds;
}

function VrfForm({ deviceType, onCommands }: { deviceType: string; onCommands: (c: string[]) => void }) {
  const { register, watch, control, formState: { errors } } = useForm<VrfFormData>({
    resolver: zodResolver(vrfSchema),
    defaultValues: {
      import_rts: [{ rt: "65000:100" }],
      export_rts: [{ rt: "65000:100" }],
      interfaces: [{ name: "GigabitEthernet0/0" }],
    },
    mode: "onChange",
  });
  const { fields: importFields, append: addImport, remove: rmImport } = useFieldArray({ control, name: "import_rts" });
  const { fields: exportFields, append: addExport, remove: rmExport } = useFieldArray({ control, name: "export_rts" });
  const { fields: ifFields, append: addIf, remove: rmIf } = useFieldArray({ control, name: "interfaces" });

  useEffect(() => {
    const sub = watch((values) => {
      const r = vrfSchema.safeParse(values);
      onCommands(r.success ? buildVrfCommands(r.data, deviceType) : []);
    });
    return () => sub.unsubscribe();
  }, [watch, onCommands, deviceType]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="VRF Name" error={errors.name?.message}>
          <input {...register("name")} className="input-field" placeholder="CUST_BLUE" />
        </Field>
        <Field label="Route Distinguisher" error={errors.rd?.message}>
          <input {...register("rd")} className="input-field" placeholder="65000:100" />
        </Field>
      </div>

      <SectionDivider label="Import Route-Targets" />
      {importFields.map((f, i) => (
        <div key={f.id} className="flex items-start gap-2 animate-fade-up">
          <Field label={`Import RT ${i + 1}`} error={(errors.import_rts?.[i] as { rt?: { message?: string } } | undefined)?.rt?.message}>
            <input {...register(`import_rts.${i}.rt`)} className="input-field" placeholder="65000:100" />
          </Field>
          {importFields.length > 1 && (
            <button type="button" onClick={() => rmImport(i)} title="Remove import route-target" aria-label="Remove import route-target" className="mt-6 p-2 rounded-lg text-ink-muted hover:text-crimson hover:bg-crimson/10 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => addImport({ rt: "" })} className="btn-ghost text-xs w-full">
        <Plus className="w-3.5 h-3.5" /> Add Import RT
      </button>

      <SectionDivider label="Export Route-Targets" />
      {exportFields.map((f, i) => (
        <div key={f.id} className="flex items-start gap-2 animate-fade-up">
          <Field label={`Export RT ${i + 1}`} error={(errors.export_rts?.[i] as { rt?: { message?: string } } | undefined)?.rt?.message}>
            <input {...register(`export_rts.${i}.rt`)} className="input-field" placeholder="65000:100" />
          </Field>
          {exportFields.length > 1 && (
            <button type="button" onClick={() => rmExport(i)} title="Remove export route-target" aria-label="Remove export route-target" className="mt-6 p-2 rounded-lg text-ink-muted hover:text-crimson hover:bg-crimson/10 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => addExport({ rt: "" })} className="btn-ghost text-xs w-full">
        <Plus className="w-3.5 h-3.5" /> Add Export RT
      </button>

      <SectionDivider label="Bound Interfaces" />
      {ifFields.map((f, i) => (
        <div key={f.id} className="flex items-start gap-2 animate-fade-up">
          <Field label={`Interface ${i + 1}`} error={(errors.interfaces?.[i] as { name?: { message?: string } } | undefined)?.name?.message}>
            <input {...register(`interfaces.${i}.name`)} className="input-field" placeholder="GigabitEthernet0/0" />
          </Field>
          {ifFields.length > 1 && (
            <button type="button" onClick={() => rmIf(i)} title="Remove bound interface" aria-label="Remove bound interface" className="mt-6 p-2 rounded-lg text-ink-muted hover:text-crimson hover:bg-crimson/10 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => addIf({ name: "" })} className="btn-ghost text-xs w-full">
        <Plus className="w-3.5 h-3.5" /> Add Interface
      </button>
    </div>
  );
}

// ── Prefix-list form ─────────────────────────────────────────────────────

export function buildPrefixListCommands(d: PrefixListFormData): string[] {
  return d.entries.flatMap((entry) => {
    const rangeBits = `${entry.ge ? ` ge ${entry.ge}` : ""}${entry.le ? ` le ${entry.le}` : ""}`;
    return [`ip prefix-list ${d.name} seq ${entry.seq} ${entry.action} ${entry.prefix}/${entry.prefix_length}${rangeBits}`];
  });
}

function PrefixListForm({ onCommands }: { onCommands: (c: string[]) => void }) {
  const { register, watch, control, formState: { errors } } = useForm<PrefixListFormData>({
    resolver: zodResolver(prefixListSchema),
    defaultValues: {
      entries: [{ seq: 10, action: "permit", prefix: "0.0.0.0", prefix_length: 0 }],
    },
    mode: "onChange",
  });
  const { fields, append, remove } = useFieldArray({ control, name: "entries" });

  useEffect(() => {
    const sub = watch((values) => {
      const r = prefixListSchema.safeParse(values);
      onCommands(r.success ? buildPrefixListCommands(r.data) : []);
    });
    return () => sub.unsubscribe();
  }, [watch, onCommands]);

  return (
    <div className="space-y-4">
      <Field label="Prefix-List Name" error={errors.name?.message}>
        <input {...register("name")} className="input-field" placeholder="PL-INET-IN" />
      </Field>
      <SectionDivider label="Entries" />
      {fields.map((f, i) => (
        <div key={f.id} className="p-3 rounded-lg border border-edge-dim bg-depth space-y-3 animate-fade-up">
          <div className="grid grid-cols-3 gap-2">
            <Field label="Seq" error={errors.entries?.[i]?.seq?.message}>
              <input {...register(`entries.${i}.seq`, { valueAsNumber: true })} className="input-field" type="number" min={1} placeholder="10" />
            </Field>
            <Field label="Action" error={errors.entries?.[i]?.action?.message}>
              <div className="relative">
                <select {...register(`entries.${i}.action`)} className="input-field appearance-none pr-8">
                  <option value="permit">permit</option>
                  <option value="deny">deny</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
              </div>
            </Field>
            <Field label="Prefix Len" error={errors.entries?.[i]?.prefix_length?.message}>
              <input {...register(`entries.${i}.prefix_length`, { valueAsNumber: true })} className="input-field" type="number" min={0} max={32} placeholder="24" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Prefix" error={errors.entries?.[i]?.prefix?.message}>
              <input {...register(`entries.${i}.prefix`)} className="input-field" placeholder="10.10.0.0" />
            </Field>
            <Field label="GE (opt.)" error={errors.entries?.[i]?.ge?.message}>
              <input {...register(`entries.${i}.ge`, { valueAsNumber: true })} className="input-field" type="number" min={0} max={32} placeholder="24" />
            </Field>
            <Field label="LE (opt.)" error={errors.entries?.[i]?.le?.message}>
              <input {...register(`entries.${i}.le`, { valueAsNumber: true })} className="input-field" type="number" min={0} max={32} placeholder="32" />
            </Field>
          </div>
          {fields.length > 1 && (
            <button type="button" onClick={() => remove(i)} className="flex items-center gap-1 text-2xs text-crimson/70 hover:text-crimson transition-colors font-mono">
              <Trash2 className="w-3 h-3" /> Remove entry
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => append({ seq: fields.length * 10 + 10, action: "permit", prefix: "", prefix_length: 24 })} className="btn-ghost text-xs w-full">
        <Plus className="w-3.5 h-3.5" /> Add Entry
      </button>
    </div>
  );
}

// ── Route-map form ───────────────────────────────────────────────────────

export function buildRouteMapCommands(d: RouteMapFormData): string[] {
  const cmds: string[] = [];
  for (const seq of d.sequences) {
    cmds.push(`route-map ${d.name} ${seq.action} ${seq.seq}`);
    if (seq.match_prefix_list) cmds.push(`   match ip address prefix-list ${seq.match_prefix_list}`);
    if (seq.match_acl) cmds.push(`   match ip address ${seq.match_acl}`);
    if (seq.set_local_pref !== undefined) cmds.push(`   set local-preference ${seq.set_local_pref}`);
    if (seq.set_metric !== undefined) cmds.push(`   set metric ${seq.set_metric}`);
    if (seq.set_next_hop) cmds.push(`   set ip next-hop ${seq.set_next_hop}`);
    cmds.push("!");
  }
  return cmds;
}

function RouteMapForm({ onCommands }: { onCommands: (c: string[]) => void }) {
  const { register, watch, control, formState: { errors } } = useForm<RouteMapFormData>({
    resolver: zodResolver(routeMapSchema),
    defaultValues: {
      sequences: [{ seq: 10, action: "permit" }],
    },
    mode: "onChange",
  });
  const { fields, append, remove } = useFieldArray({ control, name: "sequences" });

  useEffect(() => {
    const sub = watch((values) => {
      const r = routeMapSchema.safeParse(values);
      onCommands(r.success ? buildRouteMapCommands(r.data) : []);
    });
    return () => sub.unsubscribe();
  }, [watch, onCommands]);

  return (
    <div className="space-y-4">
      <Field label="Route-Map Name" error={errors.name?.message}>
        <input {...register("name")} className="input-field" placeholder="RM-INBOUND" />
      </Field>
      <SectionDivider label="Sequences" />
      {fields.map((f, i) => (
        <div key={f.id} className="p-3 rounded-lg border border-edge-dim bg-depth space-y-3 animate-fade-up">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Sequence" error={errors.sequences?.[i]?.seq?.message}>
              <input {...register(`sequences.${i}.seq`, { valueAsNumber: true })} className="input-field" type="number" min={1} placeholder="10" />
            </Field>
            <Field label="Action" error={errors.sequences?.[i]?.action?.message}>
              <div className="relative">
                <select {...register(`sequences.${i}.action`)} className="input-field appearance-none pr-8">
                  <option value="permit">permit</option>
                  <option value="deny">deny</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Match Prefix-List (opt.)" error={errors.sequences?.[i]?.match_prefix_list?.message}>
              <input {...register(`sequences.${i}.match_prefix_list`)} className="input-field" placeholder="PL-INET-IN" />
            </Field>
            <Field label="Match ACL (opt.)" error={errors.sequences?.[i]?.match_acl?.message}>
              <input {...register(`sequences.${i}.match_acl`)} className="input-field" placeholder="ACL-IN" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Set LocalPref" error={errors.sequences?.[i]?.set_local_pref?.message}>
              <input {...register(`sequences.${i}.set_local_pref`, { valueAsNumber: true })} className="input-field" type="number" min={0} placeholder="200" />
            </Field>
            <Field label="Set Metric" error={errors.sequences?.[i]?.set_metric?.message}>
              <input {...register(`sequences.${i}.set_metric`, { valueAsNumber: true })} className="input-field" type="number" min={0} placeholder="50" />
            </Field>
            <Field label="Set Next-Hop" error={errors.sequences?.[i]?.set_next_hop?.message}>
              <input {...register(`sequences.${i}.set_next_hop`)} className="input-field" placeholder="10.0.0.1" />
            </Field>
          </div>
          {fields.length > 1 && (
            <button type="button" onClick={() => remove(i)} className="flex items-center gap-1 text-2xs text-crimson/70 hover:text-crimson transition-colors font-mono">
              <Trash2 className="w-3 h-3" /> Remove sequence
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => append({ seq: fields.length * 10 + 10, action: "permit" })} className="btn-ghost text-xs w-full">
        <Plus className="w-3.5 h-3.5" /> Add Sequence
      </button>
    </div>
  );
}

// ── PBR form ─────────────────────────────────────────────────────────────

export function buildPbrCommands(d: PbrFormData): string[] {
  const cmds: string[] = [];
  for (const rule of d.rules) {
    cmds.push(`route-map ${d.policy_name} permit ${rule.seq}`);
    cmds.push(`   match ip address ${rule.match_acl}`);
    cmds.push(`   set ip next-hop ${rule.set_next_hop}`);
    cmds.push("!");
  }
  cmds.push(`interface ${d.interface_name}`);
  cmds.push(`   ip policy route-map ${d.policy_name}`);
  cmds.push("!");
  return cmds;
}

function PbrForm({ onCommands }: { onCommands: (c: string[]) => void }) {
  const { register, watch, control, formState: { errors } } = useForm<PbrFormData>({
    resolver: zodResolver(pbrSchema),
    defaultValues: { rules: [{ seq: 10, match_acl: "PBR-ACL", set_next_hop: "10.0.0.1" }] },
    mode: "onChange",
  });
  const { fields, append, remove } = useFieldArray({ control, name: "rules" });

  useEffect(() => {
    const sub = watch((values) => {
      const r = pbrSchema.safeParse(values);
      onCommands(r.success ? buildPbrCommands(r.data) : []);
    });
    return () => sub.unsubscribe();
  }, [watch, onCommands]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Policy Name" error={errors.policy_name?.message}>
          <input {...register("policy_name")} className="input-field" placeholder="PBR-INBOUND" />
        </Field>
        <Field label="Apply Interface" error={errors.interface_name?.message}>
          <input {...register("interface_name")} className="input-field" placeholder="GigabitEthernet0/0" />
        </Field>
      </div>

      <SectionDivider label="Policy Rules" />
      {fields.map((f, i) => (
        <div key={f.id} className="p-3 rounded-lg border border-edge-dim bg-depth space-y-2 animate-fade-up">
          <div className="grid grid-cols-3 gap-2">
            <Field label="Seq" error={errors.rules?.[i]?.seq?.message}>
              <input {...register(`rules.${i}.seq`, { valueAsNumber: true })} className="input-field" type="number" min={1} placeholder="10" />
            </Field>
            <Field label="Match ACL" error={errors.rules?.[i]?.match_acl?.message}>
              <input {...register(`rules.${i}.match_acl`)} className="input-field" placeholder="PBR-ACL" />
            </Field>
            <Field label="Set Next-Hop" error={errors.rules?.[i]?.set_next_hop?.message}>
              <input {...register(`rules.${i}.set_next_hop`)} className="input-field" placeholder="10.0.0.1" />
            </Field>
          </div>
          {fields.length > 1 && (
            <button type="button" onClick={() => remove(i)} className="flex items-center gap-1 text-2xs text-crimson/70 hover:text-crimson transition-colors font-mono">
              <Trash2 className="w-3 h-3" /> Remove rule
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => append({ seq: fields.length * 10 + 10, match_acl: "", set_next_hop: "" })} className="btn-ghost text-xs w-full">
        <Plus className="w-3.5 h-3.5" /> Add Rule
      </button>
    </div>
  );
}

// ── QoS form ─────────────────────────────────────────────────────────────

export function buildQosCommands(d: QosFormData): string[] {
  const cmds: string[] = [];
  for (const cls of d.classes) {
    cmds.push(`class-map match-any ${cls.class_name}`);
    if (cls.match_acl) cmds.push(`   match access-group name ${cls.match_acl}`);
    cmds.push("!");
  }

  cmds.push(`policy-map ${d.policy_name}`);
  for (const cls of d.classes) {
    cmds.push(`   class ${cls.class_name}`);
    if (cls.priority) cmds.push("      priority");
    if (cls.bandwidth_percent !== undefined) cmds.push(`      bandwidth percent ${cls.bandwidth_percent}`);
    if (cls.police_rate_kbps !== undefined) cmds.push(`      police ${cls.police_rate_kbps * 1000}`);
  }
  cmds.push("!");

  if (d.interface_name) {
    cmds.push(`interface ${d.interface_name}`);
    cmds.push(`   service-policy output ${d.policy_name}`);
    cmds.push("!");
  }
  return cmds;
}

function QosForm({ onCommands }: { onCommands: (c: string[]) => void }) {
  const { register, watch, control, formState: { errors } } = useForm<QosFormData>({
    resolver: zodResolver(qosSchema),
    defaultValues: { classes: [{ class_name: "CLASS-CRITICAL", priority: true }] },
    mode: "onChange",
  });
  const { fields, append, remove } = useFieldArray({ control, name: "classes" });

  useEffect(() => {
    const sub = watch((values) => {
      const r = qosSchema.safeParse(values);
      onCommands(r.success ? buildQosCommands(r.data) : []);
    });
    return () => sub.unsubscribe();
  }, [watch, onCommands]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Policy Name" error={errors.policy_name?.message}>
          <input {...register("policy_name")} className="input-field" placeholder="PM-EDGE-OUT" />
        </Field>
        <Field label="Apply Interface (opt.)" error={errors.interface_name?.message}>
          <input {...register("interface_name")} className="input-field" placeholder="GigabitEthernet0/1" />
        </Field>
      </div>

      <SectionDivider label="Classes" />
      {fields.map((f, i) => (
        <div key={f.id} className="p-3 rounded-lg border border-edge-dim bg-depth space-y-3 animate-fade-up">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Class Name" error={errors.classes?.[i]?.class_name?.message}>
              <input {...register(`classes.${i}.class_name`)} className="input-field" placeholder="CLASS-CRITICAL" />
            </Field>
            <Field label="Match ACL (opt.)" error={errors.classes?.[i]?.match_acl?.message}>
              <input {...register(`classes.${i}.match_acl`)} className="input-field" placeholder="ACL-QOS" />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Field label="Bandwidth %" error={errors.classes?.[i]?.bandwidth_percent?.message}>
              <input {...register(`classes.${i}.bandwidth_percent`, { valueAsNumber: true })} className="input-field" type="number" min={1} max={100} placeholder="30" />
            </Field>
            <Field label="Police kbps" error={errors.classes?.[i]?.police_rate_kbps?.message}>
              <input {...register(`classes.${i}.police_rate_kbps`, { valueAsNumber: true })} className="input-field" type="number" min={8} placeholder="50000" />
            </Field>
            <label className="flex items-end gap-2 pb-2 cursor-pointer select-none text-xs text-ink-secondary">
              <input {...register(`classes.${i}.priority`)} type="checkbox" className="accent-cyan-400" />
              Priority queue
            </label>
          </div>

          {fields.length > 1 && (
            <button type="button" onClick={() => remove(i)} className="flex items-center gap-1 text-2xs text-crimson/70 hover:text-crimson transition-colors font-mono">
              <Trash2 className="w-3 h-3" /> Remove class
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => append({ class_name: "", priority: false })} className="btn-ghost text-xs w-full">
        <Plus className="w-3.5 h-3.5" /> Add Class
      </button>
    </div>
  );
}

// ── SNMP form ────────────────────────────────────────────────────────────

export function buildSnmpCommands(d: SnmpFormData): string[] {
  const cmds: string[] = [];

  if (d.version === "v2c") {
    if (d.read_community) cmds.push(`snmp-server community ${d.read_community} RO`);
    if (d.write_community) cmds.push(`snmp-server community ${d.write_community} RW`);
    if (d.trap_host) cmds.push(`snmp-server host ${d.trap_host} version 2c ${d.read_community ?? "public"}`);
  } else {
    cmds.push("snmp-server group NEXUS-V3 v3 priv");
    if (d.trap_host) cmds.push(`snmp-server host ${d.trap_host} version 3 priv NEXUS-V3`);
  }

  if (d.location) cmds.push(`snmp-server location ${d.location}`);
  if (d.contact) cmds.push(`snmp-server contact ${d.contact}`);
  cmds.push("!");
  return cmds;
}

function SnmpForm({ onCommands }: { onCommands: (c: string[]) => void }) {
  const { register, watch, formState: { errors } } = useForm<SnmpFormData>({
    resolver: zodResolver(snmpSchema),
    defaultValues: { version: "v2c", read_community: "public" },
    mode: "onChange",
  });

  useEffect(() => {
    const sub = watch((values) => {
      const r = snmpSchema.safeParse(values);
      onCommands(r.success ? buildSnmpCommands(r.data) : []);
    });
    return () => sub.unsubscribe();
  }, [watch, onCommands]);

  const version = watch("version");

  return (
    <div className="space-y-4">
      <Field label="SNMP Version" error={errors.version?.message}>
        <div className="relative">
          <select {...register("version")} className="input-field appearance-none pr-8">
            <option value="v2c">v2c</option>
            <option value="v3">v3</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
        </div>
      </Field>

      {version === "v2c" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Read Community" error={errors.read_community?.message}>
            <input {...register("read_community")} className="input-field" placeholder="public" />
          </Field>
          <Field label="Write Community (opt.)" error={errors.write_community?.message}>
            <input {...register("write_community")} className="input-field" placeholder="private" />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Location (opt.)" error={errors.location?.message}>
          <input {...register("location")} className="input-field" placeholder="DC1-Rack12" />
        </Field>
        <Field label="Contact (opt.)" error={errors.contact?.message}>
          <input {...register("contact")} className="input-field" placeholder="noc@example.com" />
        </Field>
      </div>

      <Field label="Trap Host (opt.)" error={errors.trap_host?.message}>
        <input {...register("trap_host")} className="input-field" placeholder="10.0.200.10" />
      </Field>
    </div>
  );
}

// ── Syslog form ──────────────────────────────────────────────────────────

export function buildSyslogCommands(d: SyslogFormData): string[] {
  const cmds: string[] = [];
  if (d.source_interface) cmds.push(`logging source-interface ${d.source_interface}`);

  for (const host of d.hosts) {
    let hostCmd = `logging host ${host.ip}`;
    if (host.transport === "tcp") {
      hostCmd += ` transport tcp port ${host.port}`;
    } else if (host.port !== 514) {
      hostCmd += ` transport udp port ${host.port}`;
    }
    cmds.push(hostCmd);
  }

  const topSeverity = d.hosts[0]?.severity;
  if (topSeverity) cmds.push(`logging trap ${topSeverity}`);
  cmds.push("!");
  return cmds;
}

function SyslogForm({ onCommands }: { onCommands: (c: string[]) => void }) {
  const { register, watch, control, formState: { errors } } = useForm<SyslogFormData>({
    resolver: zodResolver(syslogSchema),
    defaultValues: { hosts: [{ ip: "10.0.200.20", transport: "udp", port: 514, severity: "informational" }] },
    mode: "onChange",
  });
  const { fields, append, remove } = useFieldArray({ control, name: "hosts" });

  useEffect(() => {
    const sub = watch((values) => {
      const r = syslogSchema.safeParse(values);
      onCommands(r.success ? buildSyslogCommands(r.data) : []);
    });
    return () => sub.unsubscribe();
  }, [watch, onCommands]);

  return (
    <div className="space-y-4">
      <Field label="Source Interface (opt.)" error={errors.source_interface?.message}>
        <input {...register("source_interface")} className="input-field" placeholder="Loopback0" />
      </Field>

      <SectionDivider label="Syslog Hosts" />
      {fields.map((f, i) => (
        <div key={f.id} className="p-3 rounded-lg border border-edge-dim bg-depth space-y-3 animate-fade-up">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Host IP" error={errors.hosts?.[i]?.ip?.message}>
              <input {...register(`hosts.${i}.ip`)} className="input-field" placeholder="10.0.200.20" />
            </Field>
            <Field label="Transport" error={errors.hosts?.[i]?.transport?.message}>
              <div className="relative">
                <select {...register(`hosts.${i}.transport`)} className="input-field appearance-none pr-8">
                  <option value="udp">udp</option>
                  <option value="tcp">tcp</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Port" error={errors.hosts?.[i]?.port?.message}>
              <input {...register(`hosts.${i}.port`, { valueAsNumber: true })} className="input-field" type="number" min={1} max={65535} placeholder="514" />
            </Field>
            <Field label="Severity" error={errors.hosts?.[i]?.severity?.message}>
              <div className="relative">
                <select {...register(`hosts.${i}.severity`)} className="input-field appearance-none pr-8">
                  <option value="emergencies">emergencies</option>
                  <option value="alerts">alerts</option>
                  <option value="critical">critical</option>
                  <option value="errors">errors</option>
                  <option value="warnings">warnings</option>
                  <option value="notifications">notifications</option>
                  <option value="informational">informational</option>
                  <option value="debugging">debugging</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
              </div>
            </Field>
          </div>
          {fields.length > 1 && (
            <button type="button" onClick={() => remove(i)} className="flex items-center gap-1 text-2xs text-crimson/70 hover:text-crimson transition-colors font-mono">
              <Trash2 className="w-3 h-3" /> Remove host
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => append({ ip: "", transport: "udp", port: 514, severity: "informational" })} className="btn-ghost text-xs w-full">
        <Plus className="w-3.5 h-3.5" /> Add Host
      </button>
    </div>
  );
}

// ── AAA form ─────────────────────────────────────────────────────────────

export function buildAaaCommands(d: AaaFormData): string[] {
  const cmds: string[] = [];
  if (d.enable_new_model) cmds.push("aaa new-model");
  cmds.push(`aaa authentication login default ${d.auth_login_method}`);
  cmds.push(`aaa authorization exec default ${d.authz_exec_method}`);
  if (d.acct_exec_method !== "none") cmds.push(`aaa accounting exec default ${d.acct_exec_method}`);
  for (const user of d.users) {
    cmds.push(`username ${user.username} privilege ${user.privilege} secret ${user.secret}`);
  }
  cmds.push("!");
  return cmds;
}

function AaaForm({ onCommands }: { onCommands: (c: string[]) => void }) {
  const { register, watch, control, formState: { errors } } = useForm<AaaFormData>({
    resolver: zodResolver(aaaSchema),
    defaultValues: {
      enable_new_model: true,
      auth_login_method: "local",
      authz_exec_method: "local",
      acct_exec_method: "none",
      users: [{ username: "netops", privilege: 15, secret: "ChangeMe123!" }],
    },
    mode: "onChange",
  });
  const { fields, append, remove } = useFieldArray({ control, name: "users" });

  useEffect(() => {
    const sub = watch((values) => {
      const r = aaaSchema.safeParse(values);
      onCommands(r.success ? buildAaaCommands(r.data) : []);
    });
    return () => sub.unsubscribe();
  }, [watch, onCommands]);

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-ink-secondary">
        <input {...register("enable_new_model")} type="checkbox" className="accent-cyan-400" />
        Enable aaa new-model
      </label>

      <div className="grid grid-cols-3 gap-2">
        <Field label="Auth Login" error={errors.auth_login_method?.message}>
          <div className="relative">
            <select {...register("auth_login_method")} className="input-field appearance-none pr-8">
              <option value="local">local</option>
              <option value="group tacacs+ local">group tacacs+ local</option>
              <option value="group radius local">group radius local</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
          </div>
        </Field>
        <Field label="AuthZ Exec" error={errors.authz_exec_method?.message}>
          <div className="relative">
            <select {...register("authz_exec_method")} className="input-field appearance-none pr-8">
              <option value="local">local</option>
              <option value="group tacacs+ local">group tacacs+ local</option>
              <option value="none">none</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
          </div>
        </Field>
        <Field label="Accounting" error={errors.acct_exec_method?.message}>
          <div className="relative">
            <select {...register("acct_exec_method")} className="input-field appearance-none pr-8">
              <option value="none">none</option>
              <option value="start-stop group tacacs+">start-stop group tacacs+</option>
              <option value="start-stop group radius">start-stop group radius</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
          </div>
        </Field>
      </div>

      <SectionDivider label="Local Users" />
      {fields.map((f, i) => (
        <div key={f.id} className="p-3 rounded-lg border border-edge-dim bg-depth space-y-2 animate-fade-up">
          <div className="grid grid-cols-3 gap-2">
            <Field label="Username" error={errors.users?.[i]?.username?.message}>
              <input {...register(`users.${i}.username`)} className="input-field" placeholder="netops" />
            </Field>
            <Field label="Privilege" error={errors.users?.[i]?.privilege?.message}>
              <input {...register(`users.${i}.privilege`, { valueAsNumber: true })} className="input-field" type="number" min={0} max={15} placeholder="15" />
            </Field>
            <Field label="Secret" error={errors.users?.[i]?.secret?.message}>
              <input {...register(`users.${i}.secret`)} className="input-field" placeholder="StrongPass!" />
            </Field>
          </div>
          {fields.length > 1 && (
            <button type="button" onClick={() => remove(i)} className="flex items-center gap-1 text-2xs text-crimson/70 hover:text-crimson transition-colors font-mono">
              <Trash2 className="w-3 h-3" /> Remove user
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => append({ username: "", privilege: 15, secret: "" })} className="btn-ghost text-xs w-full">
        <Plus className="w-3.5 h-3.5" /> Add User
      </button>
    </div>
  );
}

// ── SSH / VTY form ────────────────────────────────────────────────────────

export function buildSshCommands(d: SshFormData, dt: string): string[] {
  const isArista = dt === "arista_eos";
  const cmds: string[] = [];

  if (isArista) {
    // Arista auto-generates keys; configure management SSH and VTY
    cmds.push("management ssh");
    cmds.push(`   idle-timeout ${d.exec_timeout}`);
    cmds.push("!");
  } else {
    // Cisco: generate RSA key + set SSH version
    cmds.push(`crypto key generate rsa modulus ${d.modulus_bits}`);
    cmds.push("ip ssh version 2");
    cmds.push("!");
  }

  cmds.push(`line vty ${d.vty_lines}`);
  cmds.push(`   login ${d.auth_method}`);
  cmds.push("   transport input ssh");
  if (!isArista) cmds.push(`   exec-timeout ${d.exec_timeout} 0`);
  cmds.push("!");
  return cmds;
}

function SshForm({ deviceType, onCommands }: { deviceType: string; onCommands: (c: string[]) => void }) {
  const isArista = deviceType === "arista_eos";
  const { register, watch, formState: { errors } } = useForm<SshFormData>({
    resolver: zodResolver(sshSchema),
    defaultValues: { modulus_bits: "2048", vty_lines: "0 4", auth_method: "local", exec_timeout: 5 },
    mode: "onChange",
  });

  useEffect(() => {
    const sub = watch((values) => {
      const r = sshSchema.safeParse(values);
      onCommands(r.success ? buildSshCommands(r.data, deviceType) : []);
    });
    return () => sub.unsubscribe();
  }, [watch, onCommands, deviceType]);

  return (
    <div className="space-y-4">
      {!isArista && (
        <Field label="RSA Modulus (bits)" error={errors.modulus_bits?.message}>
          <div className="relative">
            <select {...register("modulus_bits")} className="input-field appearance-none pr-8">
              <option value="1024">1024</option>
              <option value="2048">2048 (recommended)</option>
              <option value="4096">4096</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
          </div>
        </Field>
      )}
      {isArista && (
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/6 px-3 py-2 text-2xs text-ink-muted font-mono">
          Arista EOS auto-generates SSH keys. Only VTY and idle-timeout are configured.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="VTY Lines" error={errors.vty_lines?.message}>
          <input {...register("vty_lines")} className="input-field" placeholder="0 4" />
        </Field>
        <Field label="Exec Timeout (min)" error={errors.exec_timeout?.message}>
          <input {...register("exec_timeout", { valueAsNumber: true })} className="input-field" type="number" min={0} max={35791} placeholder="5" />
        </Field>
      </div>
      <Field label="Login Method" error={errors.auth_method?.message}>
        <div className="relative">
          <select {...register("auth_method")} className="input-field appearance-none pr-8">
            <option value="local">local</option>
            <option value="none">none</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
        </div>
      </Field>
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/6 px-3 py-2 text-2xs text-ink-muted font-mono">
        ⚠ Make sure local users are configured (AAA module) before applying SSH-only VTY.
      </div>
    </div>
  );
}

// ── Cluster navigation ───────────────────────────────────────────────────

const FEATURES: { id: Feature; label: string }[] = [
  { id: "interface",   label: "Interface" },
  { id: "vlan",        label: "VLAN" },
  { id: "stp",         label: "STP" },
  { id: "portchannel", label: "Port-Channel" },
  { id: "ospf",        label: "OSPF" },
  { id: "eigrp",       label: "EIGRP" },
  { id: "bgp",         label: "BGP" },
  { id: "static",      label: "Static Route" },
  { id: "vrf",         label: "VRF" },
  { id: "prefixlist",  label: "Prefix-List" },
  { id: "routemap",    label: "Route-Map" },
  { id: "pbr",         label: "PBR" },
  { id: "dhcp",        label: "DHCP" },
  { id: "acl",         label: "ACL" },
  { id: "nat",         label: "NAT" },
  { id: "ssh",         label: "SSH / VTY" },
  { id: "aaa",         label: "AAA" },
  { id: "qos",         label: "QoS" },
  { id: "snmp",        label: "SNMP" },
  { id: "syslog",      label: "Syslog" },
  { id: "system",      label: "System" },
];

const FEATURE_LABELS: Record<Feature, string> = FEATURES.reduce(
  (labels, feature) => ({ ...labels, [feature.id]: feature.label }),
  {} as Record<Feature, string>
);

const FEATURE_GROUPS: Array<{
  title: string;
  summary: string;
  features: Feature[];
}> = [
  {
    title: "Layer 2 — Switch",
    summary: "Interface modes, VLANs, spanning tree, and link aggregation.",
    features: ["interface", "vlan", "stp", "portchannel"],
  },
  {
    title: "Layer 3 — Routing",
    summary: "Build the control plane with dynamic protocols, static routes, and segmentation.",
    features: ["ospf", "eigrp", "bgp", "static", "vrf", "prefixlist", "routemap", "pbr"],
  },
  {
    title: "Security & Services",
    summary: "Access control, address translation, SSH access, and DHCP.",
    features: ["dhcp", "acl", "nat", "ssh", "aaa"],
  },
  {
    title: "Operations",
    summary: "QoS, telemetry, syslog, and device identity.",
    features: ["qos", "snmp", "syslog", "system"],
  },
];

const FEATURE_DETAILS: Record<Feature, { summary: string; signal: string }> = {
  interface:   { summary: "Routed port, access, trunk, SVI (Vlan N), or sub-interface with dot1q encap.", signal: "L2 / L3" },
  vlan:        { summary: "Create VLAN database entries and set their state.", signal: "layer 2" },
  stp:         { summary: "Protect the L2 fabric — set mode, priority, portfast, and BPDUguard.", signal: "loop guard" },
  portchannel: { summary: "Bundle physical uplinks into a single logical LACP or static channel.", signal: "aggregation" },
  ospf:        { summary: "Area-based IGP with passive-interface and optional connected redistribution.", signal: "igp" },
  eigrp:       { summary: "Cisco-only fast IGP. Not available on Arista EOS.", signal: "igp (cisco)" },
  bgp:         { summary: "Declare neighbors, ASNs, and advertised prefixes for eBGP / iBGP.", signal: "ebgp / ibgp" },
  static:      { summary: "Add default and edge routes without a dynamic protocol.", signal: "manual route" },
  vrf:         { summary: "Isolate tenants or services with route-target based separation.", signal: "segmentation" },
  prefixlist:  { summary: "Build reusable prefix filters for route policy.", signal: "filter" },
  routemap:    { summary: "Compose match/set policy blocks for route transformation.", signal: "policy" },
  pbr:         { summary: "Steer selected flows with explicit route-map rules applied per interface.", signal: "traffic steering" },
  dhcp:        { summary: "Define address pools, exclusions, and lease times for lab segments.", signal: "addressing" },
  acl:         { summary: "Standard or extended ACLs with top-down permit/deny entries.", signal: "security" },
  nat:         { summary: "Static, dynamic pool, or PAT/overload address translation.", signal: "translation" },
  ssh:         { summary: "Generate RSA keys, set SSH v2, and lock VTY lines to SSH-only access.", signal: "remote access" },
  aaa:         { summary: "Centralize authentication, authorization, accounting, and local users.", signal: "access control" },
  qos:         { summary: "Shape, mark, and prioritize traffic with class-maps and policy-maps.", signal: "service class" },
  snmp:        { summary: "Expose SNMP community strings, trap targets, and device location.", signal: "telemetry" },
  syslog:      { summary: "Send structured logs to remote syslog hosts at a chosen severity.", signal: "observability" },
  system:      { summary: "Set hostname, domain, DNS, NTP, and MOTD banner.", signal: "system" },
};

function FeatureClusterCard({
  title,
  summary,
  features,
  active,
  onSelect,
}: {
  title: string;
  summary: string;
  features: Feature[];
  active: Feature;
  onSelect: (feature: Feature) => void;
}) {
  return (
    <div className={cn(
      "rounded-2xl border p-4 transition-all duration-200",
      features.includes(active) ? "border-edge-glow bg-cyan-glow/6 shadow-glow-cyan-sm" : "border-edge-dim bg-depth/70"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xs font-mono uppercase tracking-[0.18em] text-cyan-300">{title}</p>
          <p className="mt-1 text-xs text-ink-muted">{summary}</p>
        </div>
        <span className="telemetry-chip px-2 py-0.5">{features.length}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {features.map((feature) => (
          <button
            key={feature}
            type="button"
            onClick={() => onSelect(feature)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-2xs font-mono transition-colors",
              active === feature
                ? "border-cyan-300/60 bg-cyan-300/12 text-cyan-200"
                : "border-edge-subtle bg-void/50 text-ink-muted hover:border-edge-glow hover:text-ink-secondary"
            )}
          >
            {FEATURE_LABELS[feature]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Export ────────────────────────────────────────────────────────────────

interface GuiPaneProps {
  deviceType: string;
  onCommandsChange: (cmds: string[]) => void;
  onFeatureChange?: (feature: Feature) => void;
}

export function GuiPane({ deviceType, onCommandsChange, onFeatureChange }: GuiPaneProps) {
  const [active, setActive] = useState<Feature>("interface");

  const switchFeature = (feature: Feature) => {
    setActive(feature);
    onFeatureChange?.(feature);
  };

  const activeGroup = FEATURE_GROUPS.find((group) => group.features.includes(active)) ?? FEATURE_GROUPS[0];
  const activeDetails = FEATURE_DETAILS[active];

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <section className="rounded-2xl border border-edge-dim bg-depth/75 p-4 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-2xs font-mono uppercase tracking-[0.2em] text-cyan-300">Configuration clusters</p>
              <h3 className="mt-1 text-sm font-semibold text-ink-bright">Pick the part of the device you want to shape</h3>
            </div>
            <span className="telemetry-chip px-2 py-0.5">{FEATURES.length} modules</span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {FEATURE_GROUPS.map((group) => (
              <FeatureClusterCard
                key={group.title}
                title={group.title}
                summary={group.summary}
                features={group.features}
                active={active}
                onSelect={switchFeature}
              />
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-edge-dim bg-surface/90 p-4 shadow-card">
          <p className="text-2xs font-mono uppercase tracking-[0.2em] text-cyan-300">Active module</p>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-ink-bright">{FEATURE_LABELS[active]}</h3>
              <p className="mt-1 text-sm text-ink-secondary">{activeDetails.summary}</p>
            </div>
            <span className="telemetry-chip px-2 py-0.5">{activeDetails.signal}</span>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-edge-subtle bg-depth/80 p-3">
              <p className="text-2xs font-mono uppercase tracking-[0.16em] text-ink-muted">workflow</p>
              <p className="mt-1 text-xs text-ink-secondary">Start with the cluster above, then refine the form below.</p>
            </div>
            <div className="rounded-xl border border-edge-subtle bg-depth/80 p-3">
              <p className="text-2xs font-mono uppercase tracking-[0.16em] text-ink-muted">device</p>
              <p className="mt-1 text-xs text-ink-secondary">{deviceType === "arista_eos" ? "Arista EOS" : deviceType}</p>
            </div>
            <div className="rounded-xl border border-edge-subtle bg-depth/80 p-3">
              <p className="text-2xs font-mono uppercase tracking-[0.16em] text-ink-muted">mode</p>
              <p className="mt-1 text-xs text-ink-secondary">Clustered cards with live CLI preview.</p>
            </div>
          </div>
        </section>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden rounded-2xl border border-edge-dim bg-surface/95 shadow-card">
        <div className="flex items-center justify-between gap-3 border-b border-edge-dim bg-depth/55 px-4 py-3">
          <div>
            <p className="text-2xs font-mono uppercase tracking-[0.2em] text-cyan-300">{activeGroup.title}</p>
            <h4 className="text-sm font-semibold text-ink-bright">{FEATURE_LABELS[active]}</h4>
          </div>
          <div className="text-right">
            <p className="text-2xs font-mono uppercase tracking-[0.16em] text-ink-muted">focus</p>
            <p className="text-xs text-ink-secondary">{activeDetails.summary}</p>
          </div>
        </div>

        <div className="h-full overflow-y-auto p-4 pr-3">
          {active === "interface" && <InterfaceForm deviceType={deviceType} onCommands={onCommandsChange} />}
          {active === "ospf" && <OspfForm deviceType={deviceType} onCommands={onCommandsChange} />}
          {active === "eigrp" && <EigrpForm deviceType={deviceType} onCommands={onCommandsChange} />}
          {active === "bgp" && <BgpForm deviceType={deviceType} onCommands={onCommandsChange} />}
          {active === "static" && <StaticRouteForm deviceType={deviceType} onCommands={onCommandsChange} />}
          {active === "vrf" && <VrfForm deviceType={deviceType} onCommands={onCommandsChange} />}
          {active === "prefixlist" && <PrefixListForm onCommands={onCommandsChange} />}
          {active === "routemap" && <RouteMapForm onCommands={onCommandsChange} />}
          {active === "pbr" && <PbrForm onCommands={onCommandsChange} />}
          {active === "qos" && <QosForm onCommands={onCommandsChange} />}
          {active === "vlan" && <VlanForm onCommands={onCommandsChange} />}
          {active === "dhcp" && <DhcpForm deviceType={deviceType} onCommands={onCommandsChange} />}
          {active === "acl" && <AclForm deviceType={deviceType} onCommands={onCommandsChange} />}
          {active === "nat" && <NatForm deviceType={deviceType} onCommands={onCommandsChange} />}
          {active === "snmp" && <SnmpForm onCommands={onCommandsChange} />}
          {active === "syslog" && <SyslogForm onCommands={onCommandsChange} />}
          {active === "aaa" && <AaaForm onCommands={onCommandsChange} />}
          {active === "ssh" && <SshForm deviceType={deviceType} onCommands={onCommandsChange} />}
          {active === "portchannel" && <PortChannelForm deviceType={deviceType} onCommands={onCommandsChange} />}
          {active === "stp" && <StpForm deviceType={deviceType} onCommands={onCommandsChange} />}
          {active === "system" && <SystemForm deviceType={deviceType} onCommands={onCommandsChange} />}
        </div>
      </div>
    </div>
  );
}
