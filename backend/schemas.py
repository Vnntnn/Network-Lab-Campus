from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from typing import Literal
import re


DeviceType = Literal["arista_eos", "cisco_iosxe", "cisco_iosxr"]
TopologyDeviceType = Literal["arista_eos", "cisco_iosxe", "cisco_iosxr", "unknown"]


# ── Lab Pod ─────────────────────────────────────────────────────────────────

class LabPodBase(BaseModel):
    pod_number: int = Field(..., ge=1, le=50)
    pod_name: str = Field(..., min_length=1, max_length=64)
    device_ip: str = Field(..., description="IPv4 address of the real device")
    device_type: DeviceType = "arista_eos"
    ssh_username: str | None = Field(default=None, max_length=64)
    ssh_password: str | None = Field(default=None, max_length=128)
    connection_protocol: Literal["ssh", "telnet"] = "telnet"
    telnet_port: int | None = Field(default=None, ge=1, le=65535, description="Custom Telnet port (optional, default: 23)")
    identity_id: int | None = Field(default=None, ge=1)
    display_name: str | None = Field(default=None, max_length=64)
    description: str = Field(default="", max_length=256)

    @field_validator("device_ip")
    @classmethod
    def validate_ipv4(cls, v: str) -> str:
        pattern = r"^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$"
        if not re.match(pattern, v):
            raise ValueError(f"'{v}' is not a valid IPv4 address")
        return v

    @model_validator(mode="after")
    def validate_ssh_credentials(self):
        """If inline SSH creds are used, require both username and password."""
        if self.connection_protocol == "ssh":
            if self.identity_id:
                return self
            has_username = bool(self.ssh_username and self.ssh_username.strip())
            has_password = bool(self.ssh_password and self.ssh_password.strip())
            if has_username ^ has_password:
                raise ValueError("Username and password must be provided together for inline SSH credentials")
        return self


class LabPodCreate(LabPodBase):
    pass


class LabPodUpdate(BaseModel):
    pod_name: str | None = Field(default=None, min_length=1, max_length=64)
    device_ip: str | None = Field(default=None)
    device_type: DeviceType | None = None
    ssh_username: str | None = Field(default=None, max_length=64)
    ssh_password: str | None = Field(default=None, max_length=128)
    connection_protocol: Literal["ssh", "telnet"] | None = None
    telnet_port: int | None = Field(default=None, ge=1, le=65535)
    identity_id: int | None = Field(default=None, ge=1)
    display_name: str | None = Field(default=None, max_length=64)
    description: str | None = Field(default=None, max_length=256)

    @field_validator("device_ip")
    @classmethod
    def validate_ipv4(cls, v: str | None) -> str | None:
        if v is None:
            return v
        pattern = r"^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$"
        if not re.match(pattern, v):
            raise ValueError(f"'{v}' is not a valid IPv4 address")
        return v



class LabPodRead(LabPodBase):
    id: int
    detected_device_type: str | None = None
    auto_detected: bool = False
    identity_name: str | None = None

    model_config = {"from_attributes": True}


class DeviceDiscoveryRequest(BaseModel):
    device_ip: str = Field(..., description="IPv4 address of the device")
    ssh_username: str | None = Field(default=None, max_length=64)
    ssh_password: str | None = Field(default=None, max_length=128)
    connection_protocol: Literal["ssh", "telnet"] = "telnet"
    port: int | None = None

    @field_validator("device_ip")
    @classmethod
    def validate_ipv4(cls, v: str) -> str:
        pattern = r"^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$"
        if not re.match(pattern, v):
            raise ValueError(f"'{v}' is not a valid IPv4 address")
        return v

    @model_validator(mode="after")
    def validate_ssh_credentials(self):
        """Require username and password for SSH connections."""
        if self.connection_protocol == "ssh":
            if not self.ssh_username or not self.ssh_username.strip():
                raise ValueError("Username is required for SSH connections")
            if not self.ssh_password or not self.ssh_password.strip():
                raise ValueError("Password is required for SSH connections")
        return self


class DeviceDiscoveryResponse(BaseModel):
    success: bool
    device_type: str | None = None
    hostname: str | None = None
    model: str | None = None
    serial_number: str | None = None
    message: str = ""
    elapsed_ms: float


class IdentityBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)
    is_default: bool = False


class IdentityCreate(IdentityBase):
    pass


class IdentityUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    username: str | None = Field(default=None, min_length=1, max_length=64)
    password: str | None = Field(default=None, min_length=1, max_length=128)
    is_default: bool | None = None


class IdentityRead(IdentityBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PodInterfaceRead(BaseModel):
    interface_name: str
    connected: bool = False
    disabled: bool = False
    can_disable: bool = True
    peer_count: int = 0


class PodInterfaceSetRequest(BaseModel):
    interface_name: str = Field(..., min_length=1, max_length=64)
    disabled: bool


class PodInterfacesResponse(BaseModel):
    pod_id: int
    pod_name: str
    discovered_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    interfaces: list[PodInterfaceRead] = Field(default_factory=list)


class PingResponse(BaseModel):
    reachable: bool
    version_line: str
    elapsed_ms: float


# ── Interface Configuration ──────────────────────────────────────────────────

class InterfaceConfig(BaseModel):
    interface_name: str = Field(..., examples=["GigabitEthernet0/0", "Ethernet1"])
    ip_address: str = Field(..., description="IPv4 address e.g. 192.168.1.1")
    prefix_length: int = Field(..., ge=1, le=32)
    shutdown: bool = False

    @field_validator("ip_address")
    @classmethod
    def validate_ip(cls, v: str) -> str:
        pattern = r"^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$"
        if not re.match(pattern, v):
            raise ValueError(f"'{v}' is not a valid IPv4 address")
        return v


# ── OSPF Configuration ───────────────────────────────────────────────────────

class OspfNetwork(BaseModel):
    network: str = Field(..., examples=["192.168.1.0"])
    wildcard: str = Field(..., examples=["0.0.0.255"])
    area: int = Field(..., ge=0, le=4294967295)


class OspfConfig(BaseModel):
    process_id: int = Field(..., ge=1, le=65535)
    router_id: str | None = Field(default=None)
    networks: list[OspfNetwork] = Field(default_factory=list)

    @field_validator("router_id")
    @classmethod
    def validate_router_id(cls, v: str | None) -> str | None:
        if v is None:
            return v
        pattern = r"^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$"
        if not re.match(pattern, v):
            raise ValueError(f"'{v}' is not a valid router ID")
        return v


# ── VLAN Configuration ───────────────────────────────────────────────────────

class VlanConfig(BaseModel):
    vlan_id: int = Field(..., ge=1, le=4094)
    name: str = Field(..., min_length=1, max_length=32)
    state: Literal["active", "suspend"] = "active"


# ── Push Request / Response ──────────────────────────────────────────────────

class PushRequest(BaseModel):
    pod_id: int
    commands: list[str] = Field(..., min_length=1)


class PushResponse(BaseModel):
    success: bool
    output: str
    elapsed_ms: float
    pre_snapshot_id: int | None = None


class ShowRequest(BaseModel):
    pod_id: int
    commands: list[str] = Field(..., min_length=1, max_length=10)


class ShowResponse(BaseModel):
    success: bool
    results: list[dict]   # [{command, output}]
    elapsed_ms: float


class SnapshotRead(BaseModel):
    id: int
    pod_id: int
    label: str
    content: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SnapshotCreate(BaseModel):
    pod_id: int
    label: str = "auto"


class MultiPushRequest(BaseModel):
    pod_ids: list[int] = Field(..., min_length=1)
    commands: list[str] = Field(..., min_length=1)


class MultiPushResult(BaseModel):
    pod_id: int
    pod_name: str
    success: bool
    elapsed_ms: float
    output: str
    error: str | None = None


class DeviceHistoryEntryRead(BaseModel):
    id: int
    device_key: str
    pod_id: int
    pod_name: str
    actor_id: str
    commands: list[str] = Field(default_factory=list)
    success: bool
    output: str
    elapsed_ms: float
    pre_snapshot_id: int | None = None
    created_at: datetime


# ── Topology Discovery ──────────────────────────────────────────────────────

class TopologyDeviceRead(BaseModel):
    id: int
    pod_number: int | None = None
    pod_name: str
    device_ip: str = ""
    device_type: TopologyDeviceType = "unknown"
    ssh_username: str = ""
    ssh_password: str = ""
    description: str = ""
    is_external: bool = False
    is_seed: bool = False
    badge_label: str | None = None
    matched_pod_id: int | None = None


class TopologyNodeDiscoveryRead(BaseModel):
    is_external: bool = False
    is_seed: bool = False
    protocols: list[str] = Field(default_factory=list)
    platform: str | None = None
    management_address: str | None = None
    local_interfaces: list[str] = Field(default_factory=list)
    remote_interfaces: list[str] = Field(default_factory=list)
    source_commands: list[str] = Field(default_factory=list)
    matched_pod_id: int | None = None


class TopologyNodeDataRead(BaseModel):
    pod: TopologyDeviceRead
    connectionCount: int = 0
    connectedPeers: list[str] = Field(default_factory=list)
    inlineConfig: bool = False
    badgeLabel: str | None = None
    discovery: TopologyNodeDiscoveryRead = Field(default_factory=TopologyNodeDiscoveryRead)


class TopologyPoint(BaseModel):
    x: float
    y: float


class TopologyNodeRead(BaseModel):
    id: str
    type: Literal["device"] = "device"
    position: TopologyPoint
    data: TopologyNodeDataRead


class TopologyEdgeDataRead(BaseModel):
    sourceLabel: str = "Eth1"
    targetLabel: str = "Eth1"
    recent: bool = False
    bandwidthMbps: int | None = None
    latencyMs: int | None = None
    adminState: Literal["up", "maintenance", "down"] = "up"
    isDiscovery: bool = False
    discoveryProtocols: list[str] = Field(default_factory=list)
    discoveryNote: str | None = None
    sourceInterfaces: list[str] = Field(default_factory=list)
    targetInterfaces: list[str] = Field(default_factory=list)


class TopologyEdgeRead(BaseModel):
    id: str
    source: str
    target: str
    type: Literal["topology"] = "topology"
    data: TopologyEdgeDataRead


class TopologyDiscoveryResponse(BaseModel):
    seed_pod_id: int
    seed_pod_name: str
    discovered_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    commands: list[str] = Field(default_factory=list)
    nodes: list[TopologyNodeRead] = Field(default_factory=list)
    edges: list[TopologyEdgeRead] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class TopologyDiscoverAllItem(BaseModel):
    pod_id: int
    pod_name: str
    success: bool
    discovered_at: datetime | None = None
    node_count: int = 0
    edge_count: int = 0
    warnings: list[str] = Field(default_factory=list)
    error: str | None = None


class TopologyDiscoverAllResponse(BaseModel):
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    total: int = 0
    successful: int = 0
    failed: int = 0
    items: list[TopologyDiscoverAllItem] = Field(default_factory=list)


class TopologyDiscoverAllJobCreateResponse(BaseModel):
    job_id: int
    status: Literal["pending", "running", "completed", "failed"]


class TopologyDiscoverAllJobRead(BaseModel):
    id: int
    owner_id: str
    status: Literal["pending", "running", "completed", "failed"]
    max_hops: int
    total: int
    successful: int
    failed: int
    items: list[TopologyDiscoverAllItem] = Field(default_factory=list)
    error_message: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    updated_at: datetime


class RouteEntryRead(BaseModel):
    code: str
    protocol: str
    prefix: str
    next_hop: str | None = None
    interface: str | None = None
    raw: str


class RouteAnalyticsResponse(BaseModel):
    pod_id: int
    pod_name: str
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source_command: str
    total_routes: int = 0
    default_route_present: bool = False
    protocol_counts: dict[str, int] = Field(default_factory=dict)
    routes: list[RouteEntryRead] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
