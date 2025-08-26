from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.environ.get("DATABASE_URL")

# DB 엔진 생성
engine = create_engine(
    DB_URL, 
    pool_pre_ping=True,
    connect_args={
        "init_command": "SET time_zone='+09:00'"  # 한국 시간대 설정
    } if "mysql" in DB_URL else {}
)

# 세션 생성
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()

# === DB Dependency ===
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()