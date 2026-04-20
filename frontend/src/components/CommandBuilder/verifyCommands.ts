export type Feature =
  | "interface" | "ospf" | "vlan" | "bgp" | "static" | "system"
  | "eigrp" | "dhcp" | "acl" | "nat" | "portchannel" | "stp"
  | "vrf" | "prefixlist" | "routemap" | "pbr" | "qos" | "snmp" | "syslog" | "aaa";

interface ShowCommand {
  label: string;
  cmd: string;
}

export const SHOW_COMMANDS: Record<Feature, ShowCommand[]> = {
  interface: [
    { label: "Int Brief",      cmd: "show ip interface brief" },
    { label: "Interfaces",     cmd: "show interfaces" },
    { label: "Int Status",     cmd: "show interfaces status" },
    { label: "Int Counters",   cmd: "show interfaces counters" },
  ],
  ospf: [
    { label: "OSPF Neighbors", cmd: "show ip ospf neighbor" },
    { label: "OSPF Detail",    cmd: "show ip ospf" },
    { label: "OSPF Routes",    cmd: "show ip route ospf" },
    { label: "OSPF Database",  cmd: "show ip ospf database" },
  ],
  eigrp: [
    { label: "EIGRP Neighbors", cmd: "show ip eigrp neighbors" },
    { label: "EIGRP Topology",  cmd: "show ip eigrp topology" },
    { label: "EIGRP Routes",    cmd: "show ip route eigrp" },
    { label: "EIGRP Interfaces",cmd: "show ip eigrp interfaces" },
  ],
  vlan: [
    { label: "VLAN Brief",     cmd: "show vlan brief" },
    { label: "VLANs",          cmd: "show vlan" },
    { label: "Int Trunk",      cmd: "show interfaces trunk" },
    { label: "MAC Table",      cmd: "show mac address-table" },
  ],
  bgp: [
    { label: "BGP Summary",    cmd: "show bgp summary" },
    { label: "BGP Neighbors",  cmd: "show bgp neighbors" },
    { label: "BGP Table",      cmd: "show ip bgp" },
    { label: "BGP Routes",     cmd: "show ip route bgp" },
  ],
  static: [
    { label: "Static Routes",  cmd: "show ip route static" },
    { label: "Full RIB",       cmd: "show ip route" },
    { label: "Route Summary",  cmd: "show ip route summary" },
  ],
  dhcp: [
    { label: "DHCP Bindings",  cmd: "show ip dhcp binding" },
    { label: "DHCP Pool",      cmd: "show ip dhcp pool" },
    { label: "DHCP Conflicts", cmd: "show ip dhcp conflict" },
    { label: "DHCP Stats",     cmd: "show ip dhcp server statistics" },
  ],
  acl: [
    { label: "Access Lists",   cmd: "show access-lists" },
    { label: "IP Access Lists",cmd: "show ip access-lists" },
    { label: "Int ACL",        cmd: "show ip interface" },
  ],
  nat: [
    { label: "NAT Translations", cmd: "show ip nat translations" },
    { label: "NAT Statistics",   cmd: "show ip nat statistics" },
    { label: "NAT Detail",       cmd: "show ip nat translations verbose" },
  ],
  portchannel: [
    { label: "Port-Channel",    cmd: "show interfaces port-channel" },
    { label: "LACP Summary",    cmd: "show lacp summary" },
    { label: "LACP Neighbors",  cmd: "show lacp neighbor" },
    { label: "Etherchannel",    cmd: "show etherchannel summary" },
  ],
  stp: [
    { label: "STP Summary",    cmd: "show spanning-tree summary" },
    { label: "STP Brief",      cmd: "show spanning-tree brief" },
    { label: "STP Detail",     cmd: "show spanning-tree detail" },
    { label: "STP Root",       cmd: "show spanning-tree root" },
  ],
  vrf: [
    { label: "VRFs",              cmd: "show vrf" },
    { label: "VRF Interfaces",    cmd: "show vrf detail" },
    { label: "VRF Routes",        cmd: "show ip route vrf all" },
  ],
  prefixlist: [
    { label: "Prefix Lists",      cmd: "show ip prefix-list" },
    { label: "Prefix List Detail",cmd: "show ip prefix-list detail" },
    { label: "RIB Prefix Match",  cmd: "show ip route" },
  ],
  routemap: [
    { label: "Route Maps",        cmd: "show route-map" },
    { label: "Policy Summary",    cmd: "show ip policy" },
    { label: "Applied Policies",  cmd: "show running-config | section route-map" },
  ],
  pbr: [
    { label: "Interface Policy",  cmd: "show ip policy" },
    { label: "Route Maps",        cmd: "show route-map" },
    { label: "PBR Config",        cmd: "show running-config | include route-map|ip policy" },
  ],
  qos: [
    { label: "Policy Maps",       cmd: "show policy-map" },
    { label: "Policy Int",        cmd: "show policy-map interface" },
    { label: "Class Maps",        cmd: "show class-map" },
  ],
  snmp: [
    { label: "SNMP Status",       cmd: "show snmp" },
    { label: "SNMP User/Comm",    cmd: "show running-config | section snmp" },
    { label: "SNMP Engine",       cmd: "show snmp engineID" },
  ],
  syslog: [
    { label: "Logging Summary",   cmd: "show logging" },
    { label: "Logging Config",    cmd: "show running-config | include logging" },
    { label: "Log Buffer",        cmd: "show logging | begin %" },
  ],
  aaa: [
    { label: "AAA Config",        cmd: "show running-config | section aaa" },
    { label: "Local Users",       cmd: "show running-config | include username" },
    { label: "Auth Sessions",     cmd: "show users" },
  ],
  system: [
    { label: "Version",        cmd: "show version" },
    { label: "Clock",          cmd: "show clock" },
    { label: "NTP Status",     cmd: "show ntp status" },
    { label: "Hosts",          cmd: "show hosts" },
    { label: "Running Config", cmd: "show running-config" },
  ],
};
