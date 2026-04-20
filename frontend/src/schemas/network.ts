import { z } from "zod";

// ── Lab Pod ───────────────────────────────────────────────────────────────

export const podSchema = z.object({
  pod_number:   z.coerce.number().int().min(1, "Min 1").max(50, "Max 50"),
  pod_name:     z.string().min(1, "Name required").max(64),
  device_ip:    z.string().regex(
    /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/,
    "Valid IPv4 required"
  ),
  device_type:  z.enum(["arista_eos", "cisco_iosxe", "cisco_iosxr"]),
  ssh_username: z.string().min(1, "Username required").max(64),
  ssh_password: z.string().min(1, "Password required").max(128),
  description:  z.string().max(256).default(""),
});
export type PodFormData = z.infer<typeof podSchema>;

const ipv4 = z
  .string()
  .regex(
    /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/,
    "Must be a valid IPv4 address"
  );

const asn = z.coerce
  .number()
  .int()
  .min(1, "Min ASN 1")
  .max(4294967295, "Max ASN 4294967295");

// ── Interface ─────────────────────────────────────────────────────────────

export const interfaceSchema = z.object({
  interface_name: z.string().min(1, "Interface name is required"),
  ip_address: ipv4,
  prefix_length: z.coerce.number().int().min(1, "Min /1").max(32, "Max /32"),
  shutdown: z.boolean().default(false),
});
export type InterfaceFormData = z.infer<typeof interfaceSchema>;

// ── OSPF ──────────────────────────────────────────────────────────────────

export const ospfNetworkSchema = z.object({
  network: ipv4,
  wildcard: ipv4,
  area: z.coerce.number().int().min(0).max(4294967295),
});

export const ospfSchema = z.object({
  process_id: z.coerce.number().int().min(1).max(65535),
  router_id: ipv4.optional().or(z.literal("")),
  networks: z.array(ospfNetworkSchema).min(1, "Add at least one network"),
});
export type OspfFormData = z.infer<typeof ospfSchema>;

// ── VLAN ──────────────────────────────────────────────────────────────────

export const vlanSchema = z.object({
  vlan_id: z.coerce.number().int().min(1).max(4094),
  name: z.string().min(1).max(32).regex(/^\S+$/, "No spaces allowed"),
  state: z.enum(["active", "suspend"]).default("active"),
});
export type VlanFormData = z.infer<typeof vlanSchema>;

// ── BGP ───────────────────────────────────────────────────────────────────

export const bgpNeighborSchema = z.object({
  ip: ipv4,
  remote_as: asn,
  description: z.string().max(80).optional(),
  update_source: z.string().optional(),
  ebgp_multihop: z.coerce.number().int().min(1).max(255).optional(),
});

export const bgpNetworkSchema = z.object({
  prefix: ipv4,
  prefix_length: z.coerce.number().int().min(0).max(32),
});

export const bgpSchema = z.object({
  local_as: asn,
  router_id: ipv4.optional().or(z.literal("")),
  neighbors: z.array(bgpNeighborSchema).min(1, "Add at least one neighbor"),
  networks: z.array(bgpNetworkSchema),
});
export type BgpFormData = z.infer<typeof bgpSchema>;

// ── Static Route ──────────────────────────────────────────────────────────

export const staticRouteEntrySchema = z.object({
  network: ipv4,
  prefix_length: z.coerce.number().int().min(0).max(32),
  next_hop: ipv4,
  admin_distance: z.coerce.number().int().min(1).max(255).optional(),
  description: z.string().max(60).optional(),
});

export const staticRouteSchema = z.object({
  routes: z.array(staticRouteEntrySchema).min(1, "Add at least one route"),
});
export type StaticRouteFormData = z.infer<typeof staticRouteSchema>;

// ── System ────────────────────────────────────────────────────────────────

export const systemSchema = z.object({
  hostname: z
    .string()
    .min(1, "Hostname required")
    .max(63)
    .regex(/^[a-zA-Z0-9-]+$/, "Only letters, digits, hyphens"),
  domain_name: z.string().max(253).optional(),
  ntp_servers: z.array(z.object({ ip: ipv4 })),
  dns_servers: z.array(z.object({ ip: ipv4 })),
  banner_motd: z.string().max(512).optional(),
});
export type SystemFormData = z.infer<typeof systemSchema>;

// ── EIGRP ─────────────────────────────────────────────────────────────────

export const eigrpNetworkSchema = z.object({
  network: ipv4,
  wildcard: ipv4,
});

export const eigrpSchema = z.object({
  as_number: asn,
  router_id: ipv4.optional().or(z.literal("")),
  networks: z.array(eigrpNetworkSchema).min(1, "Add at least one network"),
  auto_summary: z.boolean().default(false),
  passive_default: z.boolean().default(false),
});
export type EigrpFormData = z.infer<typeof eigrpSchema>;

// ── DHCP ──────────────────────────────────────────────────────────────────

export const dhcpExclusionSchema = z.object({
  start: ipv4,
  end: ipv4,
});

export const dhcpSchema = z.object({
  pool_name: z.string().min(1, "Pool name required").max(32),
  network: ipv4,
  prefix_length: z.coerce.number().int().min(1).max(32),
  default_router: ipv4.optional().or(z.literal("")),
  dns_server: ipv4.optional().or(z.literal("")),
  lease_days: z.coerce.number().int().min(0).max(365).default(1),
  exclusions: z.array(dhcpExclusionSchema),
});
export type DhcpFormData = z.infer<typeof dhcpSchema>;

// ── ACL ───────────────────────────────────────────────────────────────────

export const aclEntrySchema = z.object({
  action: z.enum(["permit", "deny"]),
  protocol: z.enum(["ip", "tcp", "udp", "icmp"]).optional(),
  source: z.string().min(1, "Source required"),
  destination: z.string().optional(),
  dst_port: z.string().optional(),
});

export const aclSchema = z.object({
  acl_type: z.enum(["standard", "extended"]),
  acl_id: z.string().min(1, "ACL name/number required").max(64),
  entries: z.array(aclEntrySchema).min(1, "Add at least one entry"),
});
export type AclFormData = z.infer<typeof aclSchema>;

// ── NAT ───────────────────────────────────────────────────────────────────

export const natSchema = z.object({
  nat_type: z.enum(["static", "dynamic", "overload"]),
  inside_interface: z.string().min(1, "Inside interface required"),
  outside_interface: z.string().min(1, "Outside interface required"),
  local_ip: ipv4.optional().or(z.literal("")),
  global_ip: ipv4.optional().or(z.literal("")),
  acl_name: z.string().optional(),
  pool_name: z.string().optional(),
  pool_start: ipv4.optional().or(z.literal("")),
  pool_end: ipv4.optional().or(z.literal("")),
});
export type NatFormData = z.infer<typeof natSchema>;

// ── Port-Channel ──────────────────────────────────────────────────────────

export const portChannelSchema = z.object({
  channel_id: z.coerce.number().int().min(1).max(256),
  mode: z.enum(["active", "passive", "on"]),
  interfaces: z.array(z.object({ name: z.string().min(1) })).min(1, "Add at least one interface"),
  description: z.string().max(80).optional(),
  ip_address: ipv4.optional().or(z.literal("")),
  prefix_length: z.coerce.number().int().min(1).max(32).optional(),
});
export type PortChannelFormData = z.infer<typeof portChannelSchema>;

// ── STP ───────────────────────────────────────────────────────────────────

export const stpSchema = z.object({
  mode: z.enum(["pvst", "rapid-pvst", "mst"]),
  vlan_id: z.coerce.number().int().min(1).max(4094).optional(),
  priority: z.coerce.number().int().min(0).max(61440).default(32768),
  portfast_interfaces: z.array(z.object({ name: z.string().min(1) })),
  bpduguard_interfaces: z.array(z.object({ name: z.string().min(1) })),
});
export type StpFormData = z.infer<typeof stpSchema>;

// ── VRF-Lite ─────────────────────────────────────────────────────────────

export const vrfSchema = z.object({
  name: z.string().min(1, "VRF name required").max(64),
  rd: z.string().min(1, "RD required").max(64),
  import_rts: z.array(z.object({ rt: z.string().min(1, "RT required").max(64) })),
  export_rts: z.array(z.object({ rt: z.string().min(1, "RT required").max(64) })),
  interfaces: z.array(z.object({ name: z.string().min(1, "Interface required") })),
});
export type VrfFormData = z.infer<typeof vrfSchema>;

// ── Prefix List ──────────────────────────────────────────────────────────

export const prefixListEntrySchema = z.object({
  seq: z.coerce.number().int().min(1).max(4294967295),
  action: z.enum(["permit", "deny"]),
  prefix: ipv4,
  prefix_length: z.coerce.number().int().min(0).max(32),
  ge: z.coerce.number().int().min(0).max(32).optional(),
  le: z.coerce.number().int().min(0).max(32).optional(),
});

export const prefixListSchema = z.object({
  name: z.string().min(1, "Prefix-list name required").max(64),
  entries: z.array(prefixListEntrySchema).min(1, "Add at least one entry"),
});
export type PrefixListFormData = z.infer<typeof prefixListSchema>;

// ── Route-Map ────────────────────────────────────────────────────────────

export const routeMapSequenceSchema = z.object({
  seq: z.coerce.number().int().min(1).max(65535),
  action: z.enum(["permit", "deny"]),
  match_prefix_list: z.string().max(64).optional(),
  match_acl: z.string().max(64).optional(),
  set_local_pref: z.coerce.number().int().min(0).max(4294967295).optional(),
  set_metric: z.coerce.number().int().min(0).max(4294967295).optional(),
  set_next_hop: ipv4.optional().or(z.literal("")),
});

export const routeMapSchema = z.object({
  name: z.string().min(1, "Route-map name required").max(64),
  sequences: z.array(routeMapSequenceSchema).min(1, "Add at least one sequence"),
});
export type RouteMapFormData = z.infer<typeof routeMapSchema>;

// ── Policy-Based Routing ─────────────────────────────────────────────────

export const pbrRuleSchema = z.object({
  seq: z.coerce.number().int().min(1).max(65535),
  match_acl: z.string().min(1, "ACL name required").max(64),
  set_next_hop: ipv4,
});

export const pbrSchema = z.object({
  policy_name: z.string().min(1, "Policy name required").max(64),
  interface_name: z.string().min(1, "Interface required").max(64),
  rules: z.array(pbrRuleSchema).min(1, "Add at least one rule"),
});
export type PbrFormData = z.infer<typeof pbrSchema>;

// ── QoS Policy ───────────────────────────────────────────────────────────

export const qosClassSchema = z.object({
  class_name: z.string().min(1, "Class name required").max(64),
  match_acl: z.string().max(64).optional(),
  priority: z.boolean().default(false),
  bandwidth_percent: z.coerce.number().int().min(1).max(100).optional(),
  police_rate_kbps: z.coerce.number().int().min(8).max(100000000).optional(),
});

export const qosSchema = z.object({
  policy_name: z.string().min(1, "Policy name required").max(64),
  interface_name: z.string().max(64).optional(),
  classes: z.array(qosClassSchema).min(1, "Add at least one class"),
});
export type QosFormData = z.infer<typeof qosSchema>;

// ── SNMP ─────────────────────────────────────────────────────────────────

export const snmpSchema = z.object({
  version: z.enum(["v2c", "v3"]).default("v2c"),
  read_community: z.string().min(1, "Read community required").max(64).optional(),
  write_community: z.string().max(64).optional(),
  location: z.string().max(128).optional(),
  contact: z.string().max(128).optional(),
  trap_host: ipv4.optional().or(z.literal("")),
});
export type SnmpFormData = z.infer<typeof snmpSchema>;

// ── Syslog ───────────────────────────────────────────────────────────────

export const syslogHostSchema = z.object({
  ip: ipv4,
  transport: z.enum(["udp", "tcp"]).default("udp"),
  port: z.coerce.number().int().min(1).max(65535).default(514),
  severity: z.enum(["emergencies", "alerts", "critical", "errors", "warnings", "notifications", "informational", "debugging"]).default("informational"),
});

export const syslogSchema = z.object({
  source_interface: z.string().max(64).optional(),
  hosts: z.array(syslogHostSchema).min(1, "Add at least one syslog host"),
});
export type SyslogFormData = z.infer<typeof syslogSchema>;

// ── AAA ──────────────────────────────────────────────────────────────────

export const aaaUserSchema = z.object({
  username: z.string().min(1, "Username required").max(64),
  privilege: z.coerce.number().int().min(0).max(15).default(15),
  secret: z.string().min(1, "Secret required").max(128),
});

export const aaaSchema = z.object({
  enable_new_model: z.boolean().default(true),
  auth_login_method: z.enum(["local", "group tacacs+ local", "group radius local"]).default("local"),
  authz_exec_method: z.enum(["local", "group tacacs+ local", "none"]).default("local"),
  acct_exec_method: z.enum(["none", "start-stop group tacacs+", "start-stop group radius"]).default("none"),
  users: z.array(aaaUserSchema).min(1, "Add at least one local user"),
});
export type AaaFormData = z.infer<typeof aaaSchema>;
