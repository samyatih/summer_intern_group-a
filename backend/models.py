import uuid
from datetime import datetime, date
from typing import Optional, Dict, Any
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, JSON

class User(SQLModel, table=True):
    __tablename__ = "users"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(unique=True, index=True)
    hashed_password: str

    total_xp: int = Field(default=0)
    current_level: int = Field(default=1)
    current_streak: int = Field(default=0)
    last_activity_date: Optional[date] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)

import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field
from sqlalchemy import UniqueConstraint


class Playlist(SQLModel, table=True):
    __tablename__ = "playlists"

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "yt_playlist_id",
            name="uq_user_playlist"
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)

    user_id: uuid.UUID = Field(
        foreign_key="users.id",
        index=True
    )

    yt_playlist_id: str = Field(index=True)

    title: str
    description: Optional[str] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)

class Video(SQLModel, table=True):
    __tablename__ = "videos"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    playlist_id: uuid.UUID = Field(foreign_key="playlists.id")
    yt_video_id: str
    sequence_order: int
    title: str
    xp_reward: int = Field(default=50)

    yt_metadata: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))

class UserProgress(SQLModel, table=True):
    __tablename__ = "user_progress"

    user_id: uuid.UUID = Field(primary_key=True, foreign_key="users.id")
    video_id: uuid.UUID = Field(primary_key=True, foreign_key="videos.id")
    highest_watched_second: float = Field(default=0)
    last_watched_second: float = Field(default=0)
    last_updated: datetime = Field(default_factory=datetime.utcnow)
    is_completed: bool = Field(default=False)
    completed_at: Optional[datetime] = None

class XpLog(SQLModel, table=True):
    __tablename__ = "xp_log"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id")
    xp_amount: int
    source_type: str
    created_at: datetime = Field(default_factory=datetime.utcnow)