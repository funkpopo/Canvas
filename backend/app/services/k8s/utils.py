"""
Kubernetes工具函数模块
提供通用的数据转换和工具函数
"""

from datetime import datetime
from typing import Optional


def calculate_age(creation_timestamp) -> str:
    """
    计算资源年龄

    Args:
        creation_timestamp: 创建时间戳

    Returns:
        格式化的年龄字符串，如 "5d", "3h", "10m", "30s"
    """
    if not creation_timestamp:
        return "Unknown"

    # 处理时区
    if hasattr(creation_timestamp, 'replace'):
        created = creation_timestamp.replace(tzinfo=None)
    else:
        return "Unknown"

    now = datetime.now()
    delta = now - created

    if delta.days > 0:
        return f"{delta.days}d"
    elif delta.seconds // 3600 > 0:
        return f"{delta.seconds // 3600}h"
    elif delta.seconds // 60 > 0:
        return f"{delta.seconds // 60}m"
    else:
        return f"{delta.seconds}s"


def parse_cpu(cpu_str: str) -> float:
    """
    解析CPU资源字符串，返回核心数

    Args:
        cpu_str: CPU字符串，如 "100m", "1", "2000n"

    Returns:
        CPU核心数（浮点数）
    """
    if not cpu_str:
        return 0.0

    cpu_str = str(cpu_str).strip()

    if cpu_str.endswith('n'):
        return float(cpu_str[:-1]) / 1_000_000_000
    elif cpu_str.endswith('m'):
        return float(cpu_str[:-1]) / 1000
    else:
        try:
            return float(cpu_str)
        except ValueError:
            return 0.0


def parse_memory(memory_str: str) -> int:
    """
    解析内存资源字符串，返回MiB

    Args:
        memory_str: 内存字符串，如 "1Gi", "512Mi", "1024Ki", "1073741824"

    Returns:
        内存大小（MiB）
    """
    if not memory_str:
        return 0

    memory_str = str(memory_str).strip()

    try:
        if memory_str.endswith('Gi'):
            return int(float(memory_str[:-2]) * 1024)
        elif memory_str.endswith('Mi'):
            return int(float(memory_str[:-2]))
        elif memory_str.endswith('Ki'):
            return int(float(memory_str[:-2]) / 1024)
        elif memory_str.endswith('G'):
            return int(float(memory_str[:-1]) * 1024)
        elif memory_str.endswith('M'):
            return int(float(memory_str[:-1]))
        elif memory_str.endswith('K'):
            return int(float(memory_str[:-1]) / 1024)
        else:
            # 假设是字节
            return int(int(memory_str) / (1024 * 1024))
    except (ValueError, TypeError):
        return 0


def format_labels_selector(labels: dict) -> str:
    """
    将标签字典转换为选择器字符串

    Args:
        labels: 标签字典

    Returns:
        标签选择器字符串，如 "app=nginx,env=prod"
    """
    if not labels:
        return ""

    selector_parts = []
    for key, value in labels.items():
        selector_parts.append(f"{key}={value}")
    return ",".join(selector_parts)


def safe_dict(obj) -> dict:
    """
    安全地将对象转换为字典

    Args:
        obj: 任意对象

    Returns:
        字典，如果对象为None则返回空字典
    """
    if obj is None:
        return {}
    return dict(obj) if hasattr(obj, '__iter__') else {}


def safe_list(obj) -> list:
    """
    安全地将对象转换为列表

    Args:
        obj: 任意对象

    Returns:
        列表，如果对象为None则返回空列表
    """
    if obj is None:
        return []
    return list(obj) if hasattr(obj, '__iter__') else []


def format_timestamp(timestamp) -> Optional[str]:
    """
    格式化时间戳为字符串

    Args:
        timestamp: 时间戳对象

    Returns:
        格式化的时间字符串，如果为None则返回None
    """
    if timestamp is None:
        return None
    return str(timestamp)
