"""Tests for device discovery functionality."""
import pytest
from services.device_discovery import _extract_cisco_info


class TestCiscoInfoExtraction:
    """Test Cisco device info parsing from 'show version' output."""

    def test_cisco_iosxe_extraction(self):
        """Test parsing Cisco IOS-XE device info."""
        output = """\
Cisco IOS XE Software, Version 17.6.1
cisco WS-C3650-48PD (MIPS) processor at 69% uptime is 1 day, 3 hours, 15 minutes
Router uptime is 1 day, 3 hours, 15 minutes
Hostname: switch-core-01
Processor board ID FRG12345678
Cisco IOS Software [Amsterdam], C3650 Software, Version 16.12.04, RELEASE SOFTWARE (fc5)
System uptime is 1 day, 3 hours, 15 minutes

Processor Serial Number: FRG12345678
"""
        info = _extract_cisco_info(output)

        assert info["device_type"] == "cisco_iosxe"
        assert info["hostname"] == "switch-core-01"
        assert info["serial_number"] == "FRG12345678"

    def test_cisco_iosxr_extraction(self):
        """Test parsing Cisco IOS-XR device info."""
        output = """\
Cisco IOS XR Software, Version 6.8.1
Hostname: router-edge-01
System Serial Number: ASR-9000-SERIAL
Model: ASR9922

Router uptime is 5 days, 12 hours, 48 minutes
"""
        info = _extract_cisco_info(output)

        assert info["device_type"] == "cisco_iosxr"
        assert info["hostname"] == "router-edge-01"

    def test_generic_cisco_info(self):
        """Test with minimal Cisco output."""
        output = """\
Cisco IOS Software, Version 15.2(4)M
Hostname: legacy-router
System uptime is 10 days, 5 hours, 30 minutes
Processor Serial Number: 12AB3CD456EF
"""
        info = _extract_cisco_info(output)

        assert info["device_type"] == "cisco_iosxe"
        assert info["hostname"] == "legacy-router"
        assert info["serial_number"] == "12AB3CD456EF"

    def test_no_hostname_in_output(self):
        """Test parsing when hostname is missing."""
        output = """\
Cisco IOS Software, Version 15.2(4)M
System uptime is 10 days, 5 hours, 30 minutes
"""
        info = _extract_cisco_info(output)

        assert info["hostname"] is None
        assert info["device_type"] == "cisco_iosxe"

    def test_model_extraction(self):
        """Test model extraction from output."""
        output = """\
Cisco IOS XE Software
cisco CSR1000V (VXE) processor at 25% uptime is 2 days
Model: CSR1000V
Hostname: csr-wan-01
"""
        info = _extract_cisco_info(output)

        assert info["model"] == "CSR1000V" or "CSR" in (info["model"] or "")
        assert info["hostname"] == "csr-wan-01"
