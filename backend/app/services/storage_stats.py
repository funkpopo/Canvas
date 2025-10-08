from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.storage_stats import StorageStatsSnapshot
from app.schemas.kubernetes import StorageUsageStats, StorageUsageByClass, StorageTrends, StorageTrendPoint
from app.services.kube_client import KubernetesService

logger = structlog.get_logger()


class StorageStatsService:
    """Service for collecting and querying storage usage statistics"""
    
    def __init__(self, kube_service: KubernetesService, db: AsyncSession):
        self.kube_service = kube_service
        self.db = db
    
    async def collect_storage_stats(self) -> None:
        """Collect current storage usage statistics and save to database"""
        try:
            # Get all storage classes
            storage_classes = await self.kube_service.list_storage_classes()
            
            # Get all PVCs
            pvcs = await self.kube_service.list_pvcs()
            
            # Group PVCs by storage class
            stats_by_class: dict[str, dict] = {}
            
            for pvc in pvcs:
                sc_name = pvc.storage_class or "default"
                
                if sc_name not in stats_by_class:
                    stats_by_class[sc_name] = {
                        "pvc_count": 0,
                        "total_capacity": 0,
                        "used_capacity": 0,
                    }
                
                stats_by_class[sc_name]["pvc_count"] += 1
                
                # Parse capacity
                if pvc.capacity:
                    capacity_bytes = self.kube_service._parse_storage_to_bytes(pvc.capacity)
                    stats_by_class[sc_name]["total_capacity"] += capacity_bytes
                    
                    # Assume bound PVCs are "used" (simplified)
                    if pvc.status == "Bound":
                        stats_by_class[sc_name]["used_capacity"] += capacity_bytes
            
            # Save snapshots to database
            timestamp = datetime.now(timezone.utc)
            
            for sc_name, stats in stats_by_class.items():
                total = stats["total_capacity"]
                used = stats["used_capacity"]
                usage_percent = (used / total * 100) if total > 0 else 0.0
                
                snapshot = StorageStatsSnapshot(
                    timestamp=timestamp,
                    storage_class=sc_name,
                    total_capacity_bytes=total,
                    used_capacity_bytes=used,
                    pvc_count=stats["pvc_count"],
                    usage_percent=usage_percent,
                )
                self.db.add(snapshot)
            
            await self.db.commit()
            logger.info("storage_stats.collected", classes=len(stats_by_class))
            
        except Exception as e:
            logger.error("storage_stats.collect_error", error=str(e))
            await self.db.rollback()
    
    async def get_usage_stats(self, hours: int = 24) -> StorageUsageStats:
        """Get current storage usage statistics"""
        try:
            # Get latest snapshot for each storage class
            cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
            
            # Query latest snapshot per storage class
            stmt = (
                select(StorageStatsSnapshot)
                .where(StorageStatsSnapshot.timestamp >= cutoff)
                .order_by(StorageStatsSnapshot.timestamp.desc())
            )
            
            result = await self.db.execute(stmt)
            snapshots = result.scalars().all()
            
            # Group by storage class and get latest
            latest_by_class: dict[str, StorageStatsSnapshot] = {}
            for snap in snapshots:
                if snap.storage_class not in latest_by_class:
                    latest_by_class[snap.storage_class] = snap
            
            # Calculate totals and by-class stats
            total_capacity = 0
            total_used = 0
            by_class: list[StorageUsageByClass] = []
            
            for sc_name, snap in latest_by_class.items():
                total_capacity += snap.total_capacity_bytes
                total_used += snap.used_capacity_bytes
                
                by_class.append(StorageUsageByClass(
                    storage_class=sc_name,
                    pvc_count=snap.pvc_count,
                    total_capacity_bytes=snap.total_capacity_bytes,
                    used_capacity_bytes=snap.used_capacity_bytes,
                    usage_percent=snap.usage_percent,
                ))
            
            overall_usage = (total_used / total_capacity * 100) if total_capacity > 0 else 0.0
            
            # Get top 5 PVCs by size
            pvcs = await self.kube_service.list_pvcs()
            pvcs_with_size = []
            for pvc in pvcs:
                if pvc.capacity:
                    size_bytes = self.kube_service._parse_storage_to_bytes(pvc.capacity)
                    pvcs_with_size.append({
                        "namespace": pvc.namespace,
                        "name": pvc.name,
                        "storage_class": pvc.storage_class,
                        "capacity": pvc.capacity,
                        "size_bytes": size_bytes,
                    })
            
            pvcs_with_size.sort(key=lambda x: x["size_bytes"], reverse=True)
            top_pvcs = pvcs_with_size[:5]
            
            return StorageUsageStats(
                total_capacity_bytes=total_capacity,
                total_used_bytes=total_used,
                overall_usage_percent=overall_usage,
                by_class=by_class,
                top_pvcs=top_pvcs,
            )
            
        except Exception as e:
            logger.error("storage_stats.get_usage_error", error=str(e))
            return StorageUsageStats()
    
    async def get_storage_trends(self, sc_name: str | None = None, days: int = 7) -> StorageTrends:
        """Get storage usage trends over time"""
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(days=days)
            
            stmt = select(StorageStatsSnapshot).where(
                StorageStatsSnapshot.timestamp >= cutoff
            )
            
            if sc_name:
                stmt = stmt.where(StorageStatsSnapshot.storage_class == sc_name)
            
            stmt = stmt.order_by(StorageStatsSnapshot.timestamp.asc())
            
            result = await self.db.execute(stmt)
            snapshots = result.scalars().all()
            
            # If querying all classes, aggregate by timestamp
            if not sc_name:
                # Group by timestamp (rounded to hour)
                by_time: dict[str, dict] = {}
                for snap in snapshots:
                    # Round to nearest hour
                    hour_key = snap.timestamp.replace(minute=0, second=0, microsecond=0).isoformat()
                    
                    if hour_key not in by_time:
                        by_time[hour_key] = {
                            "timestamp": snap.timestamp.replace(minute=0, second=0, microsecond=0),
                            "capacity": 0,
                            "used": 0,
                            "pvc_count": 0,
                        }
                    
                    by_time[hour_key]["capacity"] += snap.total_capacity_bytes
                    by_time[hour_key]["used"] += snap.used_capacity_bytes
                    by_time[hour_key]["pvc_count"] += snap.pvc_count
                
                data_points = [
                    StorageTrendPoint(
                        timestamp=item["timestamp"],
                        capacity_bytes=item["capacity"],
                        used_bytes=item["used"],
                        pvc_count=item["pvc_count"],
                    )
                    for item in sorted(by_time.values(), key=lambda x: x["timestamp"])
                ]
            else:
                # Direct mapping for single storage class
                data_points = [
                    StorageTrendPoint(
                        timestamp=snap.timestamp,
                        capacity_bytes=snap.total_capacity_bytes,
                        used_bytes=snap.used_capacity_bytes,
                        pvc_count=snap.pvc_count,
                    )
                    for snap in snapshots
                ]
            
            return StorageTrends(
                storage_class=sc_name,
                period_days=days,
                data_points=data_points,
            )
            
        except Exception as e:
            logger.error("storage_stats.get_trends_error", error=str(e))
            return StorageTrends(storage_class=sc_name, period_days=days, data_points=[])
