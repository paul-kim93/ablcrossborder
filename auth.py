import os
from typing import Optional
from datetime import datetime, timedelta
from fastapi import HTTPException, Depends, APIRouter, Form
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from db import get_db
from models import Account

# === JWT 설정 ===
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# === Auth helpers ===
def verify_password(plain, hashed): 
    return pwd_context.verify(plain, hashed)

def get_password_hash(password): 
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_account_by_username(db: Session, username: str):
    return db.query(Account).filter(Account.username == username).first()

def get_current_account(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=401, 
        detail="인증 오류", 
        headers={"WWW-Authenticate": "Bearer"}
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = get_account_by_username(db, username)
    if not user:
        raise credentials_exception
    return user

def admin_only(current: Account = Depends(get_current_account)):
    if current.type != "admin":
        raise HTTPException(status_code=403, detail="관리자 전용")
    return current

# === Auth API 라우터 ===
router = APIRouter()

@router.post("/token")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = get_account_by_username(db, form_data.username)
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="잘못된 아이디/비밀번호")
    access_token = create_access_token({"sub": user.username, "type": user.type, "seller_id": user.seller_id})
    return {"access_token": access_token, "token_type": "bearer", "user_type": user.type}

@router.get("/me")
def get_current_user_info(current: Account = Depends(get_current_account)):
    """현재 로그인한 사용자 정보 반환"""
    return {
        "username": current.username,
        "type": current.type,
        "seller_id": current.seller_id
    }

@router.post("/change-password")
async def change_password(
    current_password: str = Form(...),
    new_password: str = Form(...),
    current: Account = Depends(get_current_account),  # 👈 이렇게 변경
    db: Session = Depends(get_db)
):
    """비밀번호 변경"""
    try:
        # 현재 비밀번호 확인
        if not verify_password(current_password, current.password_hash):
            raise HTTPException(status_code=400, detail="현재 비밀번호가 올바르지 않습니다")
        
        # 새 비밀번호 해시
        new_password_hash = get_password_hash(new_password)
        
        # 비밀번호 업데이트
        current.password_hash = new_password_hash
        db.commit()
        
        return {"success": True, "message": "비밀번호가 변경되었습니다"}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"비밀번호 변경 오류: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="비밀번호 변경 실패")