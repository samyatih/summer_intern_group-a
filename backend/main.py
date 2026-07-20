import httpx
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel, create_engine, Session, select
from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv
from passlib.context import CryptContext
from pydantic import BaseModel

from models import User, Playlist, Video, UserProgress, XpLog

from datetime import datetime, timedelta, date
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from jose import jwt, JWTError
from uuid import UUID

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

SECRET_KEY = os.getenv("SECRET_KEY", "fallback-secret-key")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

engine = create_engine(DATABASE_URL, echo=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting up: Creating database tables in CockroachDB ")
    SQLModel.metadata.create_all(engine)
    yield
    print("Shutting down ")

app = FastAPI(title='LMS Core API', lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

def get_session():
    with Session(engine) as session:
        yield session

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme), session: Session = Depends(get_session)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = session.get(User, UUID(user_id))
    if user is None:
        raise credentials_exception
    return user

class UserRegister(BaseModel):
    email: str
    password: str

@app.post("/api/auth/register")
def register(user_data: UserRegister, session: Session = Depends(get_session)):
    existing_user = session.exec(select(User).where(User.email == user_data.email)).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed = pwd_context.hash(user_data.password)

    new_user = User(email=user_data.email, hashed_password=hashed)
    session.add(new_user)
    session.commit()
    session.refresh(new_user)

    return {"message": "User registered successfully", "user_id": new_user.id}

@app.post("/api/auth/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    
    user = session.exec(select(User).where(User.email == form_data.username)).first()
    
    if not user or not pwd_context.verify(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    
    today = date.today()
    if user.last_activity_date == today - timedelta(days=1):
        user.current_streak += 1 # Logged in yesterday, streak continues!
    elif user.last_activity_date != today:
        user.current_streak = 1  # Missed a day, reset to 1
        
    user.last_activity_date = today
    session.add(user)
    session.commit()

    access_token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}



@app.get('/')
def read_root():
    return {"message": "Hello World! The api is running."}


class PlaylistIngestRequest(BaseModel):
    playlist_id: str

@app.post("/api/ingest/playlist")
async def ingest_playlist(
    request: PlaylistIngestRequest,
    current_user: User = Depends(get_current_user), # Protects the route
    session: Session = Depends(get_session)
):
    if not YOUTUBE_API_KEY:
        raise HTTPException(status_code=500, detail="YouTube API key not configured.")

    base_url = "https://www.googleapis.com/youtube/v3"

    async with httpx.AsyncClient() as client:
        # 1. Fetch Playlist Metadata
        playlist_resp = await client.get(
            f"{base_url}/playlists",
            params={
                "part": "snippet",
                "id": request.playlist_id,
                "key": YOUTUBE_API_KEY
            }
        )
        playlist_data = playlist_resp.json()

        if not playlist_data.get("items"):
            raise HTTPException(status_code=404, detail="YouTube playlist not found.")

        snippet = playlist_data["items"][0]["snippet"]

        existing_playlist = session.exec(
            select(Playlist).where(
                Playlist.user_id == current_user.id,
                Playlist.yt_playlist_id == request.playlist_id
            )
        ).first()

        if existing_playlist:
            raise HTTPException(
                status_code=400,
                detail="Playlist already imported."
            )
                
        # 2. Save Playlist to CockroachDB (Matches models.py EXACTLY)
        new_playlist = Playlist(
            user_id=current_user.id,
            yt_playlist_id=request.playlist_id,
            title=snippet.get("title", "Unknown Title"),
            description=snippet.get("description", "")
        )
        session.add(new_playlist)
        session.flush() 

        # 3. Fetch all Videos in the Playlist
        videos_to_insert = []
        next_page_token = None
        seq_order = 1

        while True:
            items_resp = await client.get(
                f"{base_url}/playlistItems",
                params={
                    "part": "snippet",
                    "playlistId": request.playlist_id,
                    "maxResults": 50, # Max allowed by YouTube API
                    "pageToken": next_page_token,
                    "key": YOUTUBE_API_KEY
                }
            )
            items_data = items_resp.json()

            for item in items_data.get("items", []):
                video_snippet = item["snippet"]
                
                # 4. Create Video records (Matches models.py EXACTLY)
                video_record = Video(
                    playlist_id=new_playlist.id,
                    yt_video_id=video_snippet["resourceId"]["videoId"],
                    title=video_snippet["title"],
                    sequence_order=seq_order,
                    xp_reward=50,
                    yt_metadata=video_snippet # Saves the raw JSON to your sa_column=Column(JSON)
                )
                videos_to_insert.append(video_record)
                seq_order += 1

            next_page_token = items_data.get("nextPageToken")
            if not next_page_token:
                break # Exit loop when no more pages exist

        # 5. Bulk save videos to Database
        session.add_all(videos_to_insert)
        session.commit()
        session.refresh(new_playlist)

    return {
        "message": "Playlist ingested successfully",
        "playlist_title": new_playlist.title,
        "total_videos_added": len(videos_to_insert)
    }

@app.get("/api/playlists")
def get_playlists(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    playlists = session.exec(
        select(Playlist)
        .where(Playlist.user_id == current_user.id)
        .order_by(Playlist.created_at.desc())
    ).all()

    result = []

    for p in playlists:
        videos = session.exec(
            select(Video)
            .where(Video.playlist_id == p.id)
            .order_by(Video.sequence_order)
        ).all()

        p_dict = p.model_dump()
        p_dict["video_count"] = len(videos)

        # Thumbnail
        if videos:
            first_video = videos[0]
            try:
                thumb_url = (
                    first_video.yt_metadata
                    .get("thumbnails", {})
                    .get("high", {})
                    .get("url")
                )
                if not thumb_url:
                    thumb_url = (
                        f"https://img.youtube.com/vi/"
                        f"{first_video.yt_video_id}/hqdefault.jpg"
                    )
                p_dict["thumbnail_url"] = thumb_url
            except Exception:
                p_dict["thumbnail_url"] = (
                    f"https://img.youtube.com/vi/"
                    f"{first_video.yt_video_id}/hqdefault.jpg"
                )
        else:
            p_dict["thumbnail_url"] = None

        # -------- Progress --------

        video_ids = [video.id for video in videos]

        completed_videos = 0

        if video_ids:
            completed_videos = len(
                session.exec(
                    select(UserProgress).where(
                        UserProgress.user_id == current_user.id,
                        UserProgress.video_id.in_(video_ids),
                        UserProgress.is_completed == True
                    )
                ).all()
            )

        p_dict["completed_videos"] = completed_videos
        p_dict["is_completed"] = (
            len(videos) > 0 and completed_videos == len(videos)
        )

        result.append(p_dict)

    return result

@app.get("/api/playlists/{playlist_id}/videos")
def get_playlist_videos(
    playlist_id: UUID, 
    current_user: User = Depends(get_current_user), 
    session: Session = Depends(get_session)
):
    playlist = session.exec(
        select(Playlist).where(
            Playlist.id == playlist_id,
            Playlist.user_id == current_user.id
        )
    ).first()

    if not playlist:
        raise HTTPException(
            status_code=404,
            detail="Playlist not found."
        )
    
    videos = session.exec(select(Video).where(Video.playlist_id == playlist_id).order_by(Video.sequence_order)).all()
    progress_records = session.exec(select(UserProgress).where(UserProgress.user_id == current_user.id)).all()
    progress_lookup = {
        p.video_id: p
        for p in progress_records
    }
    
    # Sequential locking: track whether the previous video was completed
    prev_completed = True  # First video is always unlocked

    result = []
    for v in videos:
        v_dict = v.model_dump()

        progress = progress_lookup.get(v.id)

        if progress:
            v_dict["is_completed"] = progress.is_completed
            v_dict["highest_watched_second"] = progress.highest_watched_second
            v_dict["last_watched_second"] = progress.last_watched_second
        else:
            v_dict["is_completed"] = False
            v_dict["highest_watched_second"] = 0
            v_dict["last_watched_second"] = 0

        # A video is locked if the previous video in sequence is not completed
        v_dict["is_locked"] = not prev_completed
        prev_completed = v_dict["is_completed"]

        result.append(v_dict)

    return result

@app.get("/api/users/me")
def get_user_me(current_user: User = Depends(get_current_user)):
    return current_user.model_dump()




class VideoProgressRequest(BaseModel):
    video_id: UUID
    current_time: float
    duration: float


@app.post("/api/progress/update")
def update_video_progress(
    request: VideoProgressRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):

    BUFFER = 15.0  # seconds of tolerance

    # Check if video exists
    video = session.get(Video, request.video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    

    playlist = session.get(Playlist, video.playlist_id)

    if not playlist or playlist.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You do not have access to this playlist."
        )

    # Sequential locking: verify all prior videos in the playlist are completed
    prior_videos = session.exec(
        select(Video).where(
            Video.playlist_id == video.playlist_id,
            Video.sequence_order < video.sequence_order
        ).order_by(Video.sequence_order)
    ).all()

    for prior in prior_videos:
        prior_progress = session.exec(
            select(UserProgress).where(
                UserProgress.user_id == current_user.id,
                UserProgress.video_id == prior.id
            )
        ).first()
        if not prior_progress or not prior_progress.is_completed:
            raise HTTPException(
                status_code=403,
                detail="Previous video not completed. Complete videos in order."
            )

    # Get or create progress record
    progress = session.exec(
        select(UserProgress).where(
            UserProgress.user_id == current_user.id,
            UserProgress.video_id == request.video_id
        )
    ).first()

    if not progress:
        progress = UserProgress(
            user_id=current_user.id,
            video_id=request.video_id,
            highest_watched_second=0,
            last_watched_second=0,
            is_completed=False
        )

    # Prevent skipping ahead
    if request.current_time > progress.highest_watched_second + BUFFER:
        return {
            "allowed": False,
            "seek_to": progress.highest_watched_second,
            "completed": progress.is_completed
        }

    # Update watch progress
    progress.last_watched_second = request.current_time
    progress.last_updated = datetime.utcnow()

    if request.current_time > progress.highest_watched_second:
        progress.highest_watched_second = request.current_time

    # Completion check
    xp_awarded = 0
    leveled_up = False

    if (
        not progress.is_completed
        and progress.highest_watched_second >= request.duration - BUFFER
    ):
        progress.is_completed = True
        progress.completed_at = datetime.utcnow()

        # Award XP
        xp_awarded = video.xp_reward
        current_user.total_xp += xp_awarded

        new_level = (current_user.total_xp // 500) + 1
        leveled_up = new_level > current_user.current_level
        current_user.current_level = new_level

        session.add(current_user)

        xp_log = XpLog(
            user_id=current_user.id,
            xp_amount=xp_awarded,
            source_type="video_completion"
        )
        session.add(xp_log)

    session.add(progress)
    session.commit()

    return {
        "allowed": True,
        "highest_watched_second": progress.highest_watched_second,
        "last_watched_second": progress.last_watched_second,
        "completed": progress.is_completed,
        "xp_awarded": xp_awarded,
        "total_xp": current_user.total_xp,
        "current_level": current_user.current_level,
        "leveled_up": leveled_up
    }
