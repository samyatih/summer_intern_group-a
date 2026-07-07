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

@app.post("/api/progress/complete-video/{video_id}")
def complete_video(
    video_id: UUID, 
    current_user: User = Depends(get_current_user), 
    session: Session = Depends(get_session)
):
    video = session.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    statement = select(UserProgress).where(
        UserProgress.user_id == current_user.id,
        UserProgress.video_id == video_id
    )
    progress = session.exec(statement).first()

    if progress and progress.is_completed:
        return {
            "message": "Video already completed", 
            "total_xp": current_user.total_xp,
            "current_level": current_user.current_level,
            "leveled_up": False
        }

    if not progress:
        progress = UserProgress(user_id=current_user.id, video_id=video_id)
    
    progress.is_completed = True
    progress.completed_at = datetime.utcnow()
    session.add(progress)

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

    session.commit()

    return {
        "message": "Video completed successfully!",
        "xp_awarded": xp_awarded,
        "total_xp": current_user.total_xp,
        "current_level": current_user.current_level,
        "leveled_up": leveled_up
    }

@app.get('/')
def read_root():
    return {"message": "Hello World! The api is running."}