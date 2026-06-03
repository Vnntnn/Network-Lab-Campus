"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-06-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lab_pods",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.String(64), nullable=False),
        sa.Column("pod_number", sa.Integer(), nullable=False),
        sa.Column("pod_name", sa.String(64), nullable=False),
        sa.Column("device_ip", sa.String(45), nullable=False),
        sa.Column("device_type", sa.String(32), nullable=False, server_default="arista_eos"),
        sa.Column("ssh_username", sa.String(64), nullable=False),
        sa.Column("ssh_password", sa.String(128), nullable=False),
        sa.Column("connection_protocol", sa.String(16), nullable=False, server_default="telnet"),
        sa.Column("telnet_port", sa.Integer(), nullable=True),
        sa.Column("detected_device_type", sa.String(32), nullable=True),
        sa.Column("auto_detected", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("identity_id", sa.Integer(), nullable=True),
        sa.Column("display_name", sa.String(64), nullable=True),
        sa.Column("description", sa.String(256), nullable=True, server_default=""),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("owner_id", "pod_number", name="uq_lab_pods_owner_pod_number"),
    )
    op.create_index("ix_lab_pods_id", "lab_pods", ["id"])
    op.create_index("ix_lab_pods_owner_id", "lab_pods", ["owner_id"])
    op.create_index("ix_lab_pods_identity_id", "lab_pods", ["identity_id"])

    op.create_table(
        "credential_identities",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("owner_id", sa.String(64), nullable=False),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("username", sa.String(64), nullable=False),
        sa.Column("password", sa.String(128), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("owner_id", "name", name="uq_identity_owner_name"),
    )
    op.create_index("ix_credential_identities_owner_id", "credential_identities", ["owner_id"])
    op.create_index("ix_credential_identities_created_at", "credential_identities", ["created_at"])

    op.create_table(
        "pod_disabled_interfaces",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("pod_id", sa.Integer(), nullable=False),
        sa.Column("interface_name", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("pod_id", "interface_name", name="uq_pod_disabled_interface"),
    )
    op.create_index("ix_pod_disabled_interfaces_pod_id", "pod_disabled_interfaces", ["pod_id"])
    op.create_index("ix_pod_disabled_interfaces_created_at", "pod_disabled_interfaces", ["created_at"])

    op.create_table(
        "snapshots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("pod_id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(128), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_snapshots_pod_id", "snapshots", ["pod_id"])

    op.create_table(
        "device_command_history",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("device_key", sa.String(64), nullable=False),
        sa.Column("pod_id", sa.Integer(), nullable=False),
        sa.Column("pod_name", sa.String(64), nullable=False),
        sa.Column("actor_id", sa.String(64), nullable=False),
        sa.Column("commands_json", sa.Text(), nullable=False),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("output", sa.Text(), nullable=False, server_default=""),
        sa.Column("elapsed_ms", sa.Float(), nullable=False, server_default="0"),
        sa.Column("pre_snapshot_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_device_command_history_device_key", "device_command_history", ["device_key"])
    op.create_index("ix_device_command_history_pod_id", "device_command_history", ["pod_id"])
    op.create_index("ix_device_command_history_actor_id", "device_command_history", ["actor_id"])
    op.create_index("ix_device_command_history_created_at", "device_command_history", ["created_at"])

    op.create_table(
        "topology_discovery_jobs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("owner_id", sa.String(64), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="pending"),
        sa.Column("max_hops", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("successful", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("result_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_topology_discovery_jobs_owner_id", "topology_discovery_jobs", ["owner_id"])
    op.create_index("ix_topology_discovery_jobs_status", "topology_discovery_jobs", ["status"])
    op.create_index("ix_topology_discovery_jobs_created_at", "topology_discovery_jobs", ["created_at"])
    op.create_index("ix_topology_discovery_jobs_updated_at", "topology_discovery_jobs", ["updated_at"])


def downgrade() -> None:
    op.drop_table("topology_discovery_jobs")
    op.drop_table("device_command_history")
    op.drop_table("snapshots")
    op.drop_table("pod_disabled_interfaces")
    op.drop_table("credential_identities")
    op.drop_table("lab_pods")
