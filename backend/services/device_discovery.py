import asyncio
import re
import time
import socket
from typing import Optional

from scrapli import AsyncScrapli, Scrapli


class DeviceDiscoveryError(Exception):
    """Raised when device discovery fails."""
    pass


def _extract_cisco_info(output: str) -> dict:
    """Parse Cisco 'show version' output to extract device info."""
    info = {
        "device_type": None,
        "hostname": None,
        "model": None,
        "serial_number": None,
    }

    lines = output.split("\n")

    # Extract hostname from first line (usually "Hostname: router1")
    for line in lines:
        if "hostname" in line.lower() and ":" in line:
            parts = line.split(":")
            if len(parts) >= 2:
                info["hostname"] = parts[1].strip()
            break

    # Extract model - try several patterns
    for line in lines:
        # Match model patterns like CSR1000V, ASR9922, etc.
        model_match = re.search(r"\b(ASR|CRS|NCS|CSR|Catalyst|ISR|C\d+)\d+\w*\b", line, re.IGNORECASE)
        if model_match:
            info["model"] = model_match.group(0)
            break

    # Extract device type from version info
    for line in lines:
        # Cisco IOS-XE typically shows "Cisco IOS XE Software" or "Cisco IOS Software"
        if "cisco" in line.lower():
            if "ios xr" in line.lower():
                info["device_type"] = "cisco_iosxr"
                break
            elif "ios xe" in line.lower() or "iosxe" in line.lower():
                info["device_type"] = "cisco_iosxe"
                break
            elif "ios" in line.lower():
                info["device_type"] = "cisco_iosxe"  # Default to XE for generic IOS
                break

    # Extract serial number
    for line in lines:
        if "serial number" in line.lower() or "processor serial number" in line.lower():
            parts = line.split(":")
            if len(parts) >= 2:
                info["serial_number"] = parts[1].strip()
                break

    # If device_type not found by parsing, try to infer from model
    if not info["device_type"]:
        if info["model"]:
            if any(x in (info["model"] or "").upper() for x in ["ASR", "CRS", "NCS"]):
                info["device_type"] = "cisco_iosxr"
            else:
                info["device_type"] = "cisco_iosxe"

    return info


def _telnet_show_version(device_ip: str, port: int, timeout: int = 10) -> str:
    """
    Execute 'show version' via raw Telnet for devices without authentication.
    Handles Telnet negotiation and terminal control characters.
    """
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        
        sock.connect((device_ip, port))
        
        # Read initial telnet negotiation (will contain \xff bytes)
        try:
            sock.recv(4096)
        except socket.timeout:
            pass
        
        # Send newline to get prompt
        sock.sendall(b"\r\n")
        time.sleep(0.2)
        try:
            sock.recv(4096)
        except socket.timeout:
            pass
        
        # Send "show version" command
        sock.sendall(b"show version\r\n")
        time.sleep(0.5)
        
        # Collect response and handle paging
        output = b""
        while True:
            try:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                output += chunk
                
                # If we see "--More--", send space to continue
                if b"--More--" in chunk:
                    sock.sendall(b" ")
                    time.sleep(0.1)
                
                time.sleep(0.05)
            except socket.timeout:
                break
        
        sock.close()
        return output.decode('utf-8', errors='ignore')
        
    except Exception as e:
        raise DeviceDiscoveryError(f"Telnet connection failed: {e}")


async def discover_device(
    device_ip: str,
    username: Optional[str] = None,
    password: Optional[str] = None,
    protocol: str = "telnet",
    port: Optional[int] = None,
    timeout: int = 15,
) -> dict:
    """
    Auto-discover Cisco device type and extract info.

    Args:
        device_ip: IP address of the device
        username: SSH/Telnet username (required for SSH, optional for Telnet)
        password: SSH/Telnet password (required for SSH, optional for Telnet)
        protocol: Connection protocol ('ssh' or 'telnet')
        port: Custom port (default: 22 for SSH, 23 for Telnet)
        timeout: Command timeout in seconds

    Returns:
        Dictionary with keys: success, device_type, hostname, model, serial_number, message, elapsed_ms
    """
    start = time.monotonic()

    if protocol not in ("ssh", "telnet"):
        return {
            "success": False,
            "message": f"Unsupported protocol: {protocol}. Use 'ssh' or 'telnet'.",
            "elapsed_ms": round((time.monotonic() - start) * 1000, 2),
        }

    # Validate credentials for SSH
    if protocol == "ssh" and (not username or not password):
        return {
            "success": False,
            "message": "Username and password are required for SSH connections",
            "elapsed_ms": round((time.monotonic() - start) * 1000, 2),
        }

    try:
        # Set default port based on protocol
        if port is None:
            port = 22 if protocol == "ssh" else 23

        conn_kwargs = {
            "host": device_ip,
            "auth_strict_key": False,
            "timeout_socket": timeout,
            "timeout_transport": timeout * 2,
            "timeout_ops": timeout,
        }

        # Only add credentials if provided
        if username:
            conn_kwargs["auth_username"] = username
        if password:
            conn_kwargs["auth_password"] = password

        if protocol == "ssh":
            # Use AsyncScrapli for SSH
            conn_kwargs["transport"] = "asyncssh"
            conn_kwargs["platform"] = "cisco_iosxe"
            async with AsyncScrapli(**conn_kwargs) as conn:
                result = await conn.send_command("show version")
        else:
            # For Telnet without credentials, use raw telnet (device doesn't require auth)
            if not username and not password:
                try:
                    output = _telnet_show_version(device_ip, port, timeout)
                    # Parse the output
                    info = _extract_cisco_info(output)
                    return {
                        "success": True,
                        "device_type": info.get("device_type"),
                        "hostname": info.get("hostname"),
                        "model": info.get("model"),
                        "serial_number": info.get("serial_number"),
                        "message": "",
                        "elapsed_ms": round((time.monotonic() - start) * 1000, 2),
                    }
                except DeviceDiscoveryError as e:
                    return {
                        "success": False,
                        "message": str(e),
                        "elapsed_ms": round((time.monotonic() - start) * 1000, 2),
                    }
            
            # For Telnet with credentials, use Scrapli
            conn_kwargs["transport"] = "telnet"
            conn_kwargs["platform"] = "cisco_iosxe"
            conn_kwargs["port"] = port  # Pass port as separate parameter for Scrapli

            # Use synchronous Scrapli for Telnet
            conn = Scrapli(**conn_kwargs)
            conn.open()
            try:
                result = conn.send_command("show version")
            finally:
                conn.close()

        if not result.success:
            return {
                "success": False,
                "message": f"Failed to execute 'show version': {result.failed}",
                "elapsed_ms": round((time.monotonic() - start) * 1000, 2),
            }

        # Parse the output
        info = _extract_cisco_info(result.result)

        elapsed = round((time.monotonic() - start) * 1000, 2)

        return {
            "success": True,
            "device_type": info["device_type"] or "cisco_iosxe",
            "hostname": info["hostname"],
            "model": info["model"],
            "serial_number": info["serial_number"],
            "message": "Device discovered successfully",
            "elapsed_ms": elapsed,
        }

    except asyncio.TimeoutError:
        elapsed = round((time.monotonic() - start) * 1000, 2)
        return {
            "success": False,
            "message": f"Connection timeout after {timeout}s. Check if device is reachable and credentials are correct.",
            "elapsed_ms": elapsed,
        }
    except Exception as e:
        elapsed = round((time.monotonic() - start) * 1000, 2)
        return {
            "success": False,
            "message": f"Discovery error: {type(e).__name__}: {str(e)}",
            "elapsed_ms": elapsed,
        }
