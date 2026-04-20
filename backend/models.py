from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from database import Base


class LabPod(Base):
    __tablename__ = "lab_pods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    pod_number: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    pod_name: Mapped[str] = mapped_column(String(64), nullable=False)
    device_ip: Mapped[str] = mapped_column(String(45), nullable=False)
    device_type: Mapped[str] = mapped_column(String(32), nullable=False, default="arista_eos")
    ssh_username: Mapped[str] = mapped_column(String(64), nullable=False)
    ssh_password: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(String(256), nullable=True, default="")


class Snapshot(Base):
    __tablename__ = "snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pod_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
