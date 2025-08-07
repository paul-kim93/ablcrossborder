import os
import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta
from typing import List, Optional

from sqlalchemy.orm import Session

from db import SessionLocal
from models import Seller, Product, Account  # 반드시 이 3개 클래스가 models.py에 선언되어 있어야 함

from pydantic import BaseModel

app = FastAPI()

# JWT 설정
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key")  # 반드시 .env로!
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Pydantic 모델 ---
class SellerCreate(BaseModel):
    name: str
    contact: str

class SellerOut(SellerCreate):
    id: int
    class Config:
        orm_mode = True

class ProductBase(BaseModel):
    name: str
    product_code: str
    seller_id: int
    supply_price: int
    sale_price: int
    current_stock: int

class ProductCreate(ProductBase):
    thumbnail: Optional[UploadFile] = None
    detail_image: Optional[UploadFile] = None

class ProductOut(ProductBase):
    id: int
    thumbnail_url: Optional[str]
    detail_image_url: Optional[str]
    class Config:
        orm_mode = True

class AccountBase(BaseModel):
    username: str
    type: str  # admin/seller
    seller_id: Optional[int] = None

class AccountCreate(AccountBase):
    password: str

class AccountOut(AccountBase):
    id: int
    class Config:
        orm_mode = True

# --- Auth 함수 ---
def verify_password(plain, hashed): return pwd_context.verify(plain, hashed)
def get_password_hash(password): return pwd_context.hash(password)
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_account_by_username(db: Session, username: str):
    return db.query(Account).filter(Account.username == username).first()

def get_current_account(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(status_code=401, detail="인증 오류", headers={"WWW-Authenticate": "Bearer"})
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

# --- Auth API ---
@app.post("/token")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = get_account_by_username(db, form_data.username)
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="잘못된 아이디/비밀번호")
    access_token = create_access_token({"sub": user.username, "type": user.type, "seller_id": user.seller_id})
    return {"access_token": access_token, "token_type": "bearer"}

# --- 입점사 CRUD ---
@app.post("/sellers", response_model=SellerOut)
def create_seller(seller: SellerCreate, db: Session = Depends(get_db), current: Account = Depends(admin_only)):
    if db.query(Seller).filter(Seller.name == seller.name).first():
        raise HTTPException(status_code=400, detail="이미 존재하는 입점사명")
    new = Seller(name=seller.name, contact=seller.contact)
    db.add(new)
    db.commit()
    db.refresh(new)
    return new

@app.get("/sellers", response_model=List[SellerOut])
def get_sellers(db: Session = Depends(get_db), current: Account = Depends(get_current_account)):
    return db.query(Seller).all()

@app.get("/sellers/{seller_id}", response_model=SellerOut)
def get_seller(seller_id: int, db: Session = Depends(get_db), current: Account = Depends(get_current_account)):
    seller = db.query(Seller).filter(Seller.id == seller_id).first()
    if not seller:
        raise HTTPException(status_code=404, detail="입점사 없음")
    return seller

@app.put("/sellers/{seller_id}", response_model=SellerOut)
def update_seller(seller_id: int, update: SellerCreate, db: Session = Depends(get_db), current: Account = Depends(admin_only)):
    seller = db.query(Seller).filter(Seller.id == seller_id).first()
    if not seller:
        raise HTTPException(status_code=404, detail="입점사 없음")
    if db.query(Seller).filter(Seller.name == update.name, Seller.id != seller_id).first():
        raise HTTPException(status_code=400, detail="이미 존재하는 입점사명")
    seller.name, seller.contact = update.name, update.contact
    db.commit()
    db.refresh(seller)
    return seller

@app.delete("/sellers/{seller_id}")
def delete_seller(seller_id: int, db: Session = Depends(get_db), current: Account = Depends(admin_only)):
    seller = db.query(Seller).filter(Seller.id == seller_id).first()
    if not seller:
        raise HTTPException(status_code=404, detail="입점사 없음")
    db.delete(seller)
    db.commit()
    return {"ok": True}

# --- 제품 CRUD ---
@app.post("/products", response_model=ProductOut)
async def create_product(
    name: str = Form(...),
    product_code: str = Form(...),
    seller_id: int = Form(...),
    supply_price: int = Form(...),
    sale_price: int = Form(...),
    current_stock: int = Form(...),
    thumbnail: UploadFile = File(None),
    detail_image: UploadFile = File(None),
    db: Session = Depends(get_db),
    current: Account = Depends(admin_only)
):
    # 입점사 확인
    seller = db.query(Seller).filter(Seller.id == seller_id).first()
    if not seller:
        raise HTTPException(status_code=400, detail="입점사 없음")
    # 제품코드 중복 확인
    if db.query(Product).filter(Product.product_code == product_code).first():
        raise HTTPException(status_code=400, detail="이미 존재하는 제품코드")

    thumb_path, detail_path = None, None
    if thumbnail:
        thumb_path = os.path.join(UPLOAD_DIR, f"thumb_{datetime.now().timestamp()}_{thumbnail.filename}")
        with open(thumb_path, "wb") as f:
            f.write(await thumbnail.read())
    if detail_image:
        detail_path = os.path.join(UPLOAD_DIR, f"detail_{datetime.now().timestamp()}_{detail_image.filename}")
        with open(detail_path, "wb") as f:
            f.write(await detail_image.read())

    prod = Product(
        name=name,
        product_code=product_code,
        seller_id=seller_id,
        supply_price=supply_price,
        sale_price=sale_price,
        current_stock=current_stock,
        thumbnail_url=thumb_path,
        detail_image_url=detail_path
    )
    db.add(prod)
    db.commit()
    db.refresh(prod)
    return prod

@app.get("/products", response_model=List[ProductOut])
def get_products(db: Session = Depends(get_db), current: Account = Depends(get_current_account)):
    return db.query(Product).all()

@app.get("/products/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db), current: Account = Depends(get_current_account)):
    prod = db.query(Product).filter(Product.id == product_id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="제품 없음")
    return prod

@app.put("/products/{product_id}", response_model=ProductOut)
def update_product(product_id: int, update: ProductBase, db: Session = Depends(get_db), current: Account = Depends(admin_only)):
    prod = db.query(Product).filter(Product.id == product_id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="제품 없음")
    # 제품코드 중복 확인 (자기 자신 제외)
    if db.query(Product).filter(Product.product_code == update.product_code, Product.id != product_id).first():
        raise HTTPException(status_code=400, detail="이미 존재하는 제품코드")
    for attr, value in update.dict().items():
        setattr(prod, attr, value)
    db.commit()
    db.refresh(prod)
    return prod

@app.delete("/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db), current: Account = Depends(admin_only)):
    prod = db.query(Product).filter(Product.id == product_id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="제품 없음")
    # 실제 파일도 삭제(실무)
    if prod.thumbnail_url and os.path.exists(prod.thumbnail_url):
        os.remove(prod.thumbnail_url)
    if prod.detail_image_url and os.path.exists(prod.detail_image_url):
        os.remove(prod.detail_image_url)
    db.delete(prod)
    db.commit()
    return {"ok": True}

# --- 계정 CRUD ---
@app.post("/accounts", response_model=AccountOut)
def create_account(account: AccountCreate, db: Session = Depends(get_db), current: Account = Depends(admin_only)):
    if db.query(Account).filter(Account.username == account.username).first():
        raise HTTPException(status_code=400, detail="이미 존재하는 아이디")
    if account.type == "seller" and account.seller_id and not db.query(Seller).filter(Seller.id == account.seller_id).first():
        raise HTTPException(status_code=400, detail="존재하지 않는 입점사 id")
    acc = Account(
        username=account.username,
        password_hash=get_password_hash(account.password),
        type=account.type,
        seller_id=account.seller_id
    )
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return acc

@app.put("/accounts/{account_id}", response_model=AccountOut)
def update_account(account_id: int, update: AccountCreate, db: Session = Depends(get_db), current: Account = Depends(admin_only)):
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="계정 없음")
    if update.password:
        acc.password_hash = get_password_hash(update.password)
    if update.type:
        acc.type = update.type
    if update.seller_id is not None:
        acc.seller_id = update.seller_id
    db.commit()
    db.refresh(acc)
    return acc

@app.delete("/accounts/{account_id}")
def delete_account(account_id: int, db: Session = Depends(get_db), current: Account = Depends(admin_only)):
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="계정 없음")
    db.delete(acc)
    db.commit()
    return {"ok": True}

@app.get("/accounts", response_model=List[AccountOut])
def list_accounts(db: Session = Depends(get_db), current: Account = Depends(admin_only)):
    return db.query(Account).all()
