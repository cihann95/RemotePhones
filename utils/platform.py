"""Cross-platform utilities for Phone Farm system."""

import os
import sys
import platform
from typing import TYPE_CHECKING, Dict, Any, Optional

if TYPE_CHECKING:
    from core.adb import ADBClient

from utils.logger import get_logger

logger = get_logger(__name__)


def get_platform_info() -> Dict[str, Any]:
    """
    Get comprehensive platform information.
    
    Returns:
        Dictionary containing platform details
    """
    return {
        'system': platform.system(),
        'release': platform.release(),
        'version': platform.version(),
        'machine': platform.machine(),
        'processor': platform.processor(),
        'python_version': platform.python_version(),
        'is_windows': platform.system() == 'Windows',
        'is_linux': platform.system() == 'Linux',
        'is_macos': platform.system() == 'Darwin',
        'is_64bit': sys.maxsize > 2**32,
        'hostname': platform.node(),
        'executable_path': sys.executable
    }


def get_adb_path() -> str:
    """
    Get the appropriate ADB path based on platform.
    
    Returns:
        ADB executable path
    """
    # Check if ADB path is set via environment variable
    adb_path = os.environ.get('ANDROID_ADB_PATH')
    if adb_path and os.path.exists(adb_path):
        return adb_path
    
    # Platform-specific default paths
    system = platform.system()
    if system == 'Windows':
        # Common Windows ADB locations
        possible_paths = [
            r'C:\Android\platform-tools\adb.exe',
            r'C:\Program Files\Android\platform-tools\adb.exe',
            r'C:\Users\%USERNAME%\AppData\Local\Android\Sdk\platform-tools\adb.exe',
            'adb'  # Assume in PATH
        ]
    elif system == 'Linux':
        possible_paths = [
            '/usr/bin/adb',
            '/usr/local/bin/adb',
            '/opt/android-sdk/platform-tools/adb',
            os.path.expanduser('~/Android/Sdk/platform-tools/adb'),
            'adb'
        ]
    elif system == 'Darwin':  # macOS
        possible_paths = [
            '/usr/local/bin/adb',
            '/opt/homebrew/bin/adb',
            os.path.expanduser('~/Library/Android/sdk/platform-tools/adb'),
            'adb'
        ]
    else:
        # Fallback for unknown platforms
        return 'adb'
    
    # Check each possible path
    for path in possible_paths:
        expanded_path = os.path.expandvars(os.path.expanduser(path))
        if os.path.exists(expanded_path) and os.access(expanded_path, os.X_OK):
            return expanded_path
    
    # Return default (assume in PATH)
    return 'adb'


def get_screenshot_tool_path() -> str:
    """
    Get the appropriate screen capture tool path based on platform.
    
    Returns:
        Screen capture tool path
    """
    system = platform.system()
    if system == 'Windows':
        # Try to find scrcpy or similar tools
        possible_paths = [
            'scrcpy.exe',
            r'C:\Program Files\scrcpy\scrcpy.exe',
            'scrcpy'
        ]
    elif system == 'Linux':
        possible_paths = [
            'scrcpy',
            '/usr/bin/scrcpy',
            '/usr/local/bin/scrcpy',
            'screencapture'  # Linux alternatives
        ]
    elif system == 'Darwin':  # macOS
        possible_paths = [
            'scrcpy',
            '/usr/local/bin/scrcpy',
            '/opt/homebrew/bin/scrcpy',
            'screencapture'  # Built-in macOS tool
        ]
    else:
        return 'scrcpy'
    
    for path in possible_paths:
        expanded_path = os.path.expandvars(os.path.expanduser(path))
        if os.path.exists(expanded_path) and os.access(expanded_path, os.X_OK):
            return expanded_path
    
    # Return default (assume in PATH)
    return possible_paths[0] if possible_paths else 'scrcpy'


def is_android_device_connected(adb_client: ADBClient) -> bool:
    """
    Check if any Android device is connected via ADB.
    
    Args:
        adb_client: ADBClient instance
        
    Returns:
        True if at least one device is connected, False otherwise
    """
    try:
        devices = adb_client.devices()
        return len(devices) > 0
    except Exception as e:
        logger.warning("Failed to check device connection: %s", e)
        return False


def get_device_architecture(device_id: str, adb_client: ADBClient) -> Optional[str]:
    """
    Get the CPU architecture of an Android device.
    
    Args:
        device_id: Device serial number
        adb_client: ADBClient instance
        
    Returns:
        CPU architecture string (e.g., 'arm64-v8a', 'armeabi-v7a') or None
    """
    try:
        # Try to get CPU architecture from device properties
        prop: str = adb_client.shell_output(
            "getprop ro.product.cpu.abi",
            device_id=device_id
        )
        if prop.strip():
            return prop.strip()

        # Fallback to secondary property
        prop2: str = adb_client.shell_output(
            "getprop ro.product.cpu.abi2",
            device_id=device_id
        )
        if prop2.strip():
            return prop2.strip()
            
        return None
    except Exception as e:
        logger.warning("Failed to get device architecture for %s: %s", device_id, e)
        return None


def get_os_version(device_id: str, adb_client: ADBClient) -> Optional[str]:
    """
    Get the Android OS version of a device.
    
    Args:
        device_id: Device serial number
        adb_client: ADBClient instance
        
    Returns:
        Android version string (e.g., '12', '13.0') or None
    """
    try:
        prop = adb_client.shell_output(
            "getprop ro.build.version.release",
            device_id=device_id
        )
        version = prop.strip()
        return version if version else None
    except Exception as e:
        logger.warning("Failed to get OS version for %s: %s", device_id, e)
        return None


def adapt_touch_coordinates(x: int, y: int, 
                           source_width: int, source_height: int,
                           target_width: int, target_height: int) -> tuple[int, int]:
    """
    Adapt touch coordinates from one screen resolution to another.
    
    Args:
        x, y: Source coordinates
        source_width, source_height: Source screen dimensions
        target_width, target_height: Target screen dimensions
        
    Returns:
        Adapted (x, y) coordinates
    """
    if source_width <= 0 or source_height <= 0:
        return (x, y)
    
    # Scale coordinates proportionally
    adapted_x = int(x * target_width / source_width)
    adapted_y = int(y * target_height / source_height)
    
    # Ensure coordinates are within bounds
    adapted_x = max(0, min(adapted_x, target_width - 1))
    adapted_y = max(0, min(adapted_y, target_height - 1))
    
    return (adapted_x, adapted_y)


__all__ = [
    'get_platform_info',
    'get_adb_path',
    'get_screenshot_tool_path',
    'is_android_device_connected',
    'get_device_architecture',
    'get_os_version',
    'adapt_touch_coordinates'
]