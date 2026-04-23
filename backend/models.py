from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from database import Base


class LabPod(Base):
    __tablename__ = "lab_pods"
    __table_args__ = (UniqueConstraint("owner_id", "pod_number", name="uq_lab_pods_owner_pod_number"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    owner_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False, default="default")
    pod_number: Mapped[int] = mapped_column(Integer, nullable=False)
    pod_name: Mapped[str] = mapped_column(String(64), nullable=False)
    device_ip: Mapped[str] = mapped_column(String(45), nullable=False)
    device_type: Mapped[str] = mapped_column(String(32), nullable=False, default="arista_eos")
    ssh_username: Mapped[str] = mapped_column(String(64), nullable=False)
    ssh_password: Mapped[str] = mapped_column(String(128), nullable=False)
    connection_protocol: Mapped[str] = mapped_column(String(16), nullable=False, default="telnet")
    telnet_port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detected_device_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    auto_detected: Mapped[bool] = mapped_column(nullable=False, default=False)
    identity_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    description: Mapped[str] = mapped_column(String(256), nullable=True, default="")


class CredentialIdentity(Base):
    __tablename__ = "credential_identities"
    __table_args__ = (UniqueConstraint("owner_id", "name", name="uq_identity_owner_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False, default="default")
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    username: Mapped[str] = mapped_column(String(64), nullable=False)
    password: Mapped[str] = mapped_column(String(128), nullable=False)
    is_default: Mapped[bool] = mapped_column(nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


class PodDisabledInterface(Base):
    __tablename__ = "pod_disabled_interfaces"
    __table_args__ = (UniqueConstraint("pod_id", "interface_name", name="uq_pod_disabled_interface"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pod_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    interface_name: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


class Snapshot(Base):
    __tablename__ = "snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pod_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))


class DeviceCommandHistory(Base):
    __tablename__ = "device_command_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_key: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    pod_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    pod_name: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    commands_json: Mapped[str] = mapped_column(Text, nullable=False)
    success: Mapped[bool] = mapped_column(nullable=False)
    output: Mapped[str] = mapped_column(Text, nullable=False, default="")
    elapsed_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    pre_snapshot_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


class TopologyDiscoveryJob(Base):
    __tablename__ = "topology_discovery_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(24), index=True, nullable=False, default="pending")
    max_hops: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    successful: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    result_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
