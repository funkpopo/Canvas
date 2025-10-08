from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, Integer, String

from app.db import Base


class StorageStatsSnapshot(Base):
    """Storage usage statistics snapshot for trend analysis"""
    
    __tablename__ = "storage_stats_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    storage_class = Column(String, nullable=False, index=True)
    
    # Capacity metrics
    total_capacity_bytes = Column(Integer, nullable=False, default=0)
    used_capacity_bytes = Column(Integer, nullable=False, default=0)
    
    # PVC count
    pvc_count = Column(Integer, nullable=False, default=0)
    
    # Usage percentage
    usage_percent = Column(Float, nullable=False, default=0.0)
    
    def __repr__(self) -> str:
        return f"<StorageStatsSnapshot(storage_class='{self.storage_class}', timestamp={self.timestamp}, usage={self.usage_percent}%)>"
