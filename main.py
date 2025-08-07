import os
import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import List, Optional
from passlib.context import CryptContext
from jose import jwt, JWTError
from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from datetime import datetime, timedelta




app = FastAPI()

# [1] 암호화(실무 필수)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# [2] JWT 토큰 키/설정
SECRET_KEY = "your-secret-key"  # 꼭 바꿔서 사용!
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

# [3] 계정 데이터 모델
class Account(BaseModel):
    id: int
    username: str
    password_hash: str
    type: str  # 'admin' or 'seller'
    seller_id: Optional[int] = None

# [4] 계정 생성/수정용 pydantic 모델
class AccountCreate(BaseModel):
    username: str
    password: str
    type: str  # 'admin' or 'seller'
    seller_id: Optional[int] = None

class AccountUpdate(BaseModel):
    password: Optional[str] = None
    type: Optional[str] = None
    seller_id: Optional[int] = None

# [5] JWT/OAuth 함수들
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_account_by_username(username: str):
    return next((a for a in accounts if a.username == username), None)

def get_current_account(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    account = get_account_by_username(username)
    if account is None:
        raise credentials_exception
    return account

# [6] 로그인(API 인증용 토큰 발급)
@app.post("/token")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = get_account_by_username(form_data.username)
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="잘못된 아이디/비밀번호")
    access_token = create_access_token(
        data={"sub": user.username, "type": user.type, "seller_id": user.seller_id}
    )
    return {"access_token": access_token, "token_type": "bearer"}

# [1] 입력(등록/수정) 모델: id 없이 name/contact만
class SellerCreate(BaseModel):
    name: str
    contact: str

# [2] 출력(조회/수정반환) 모델: id 포함
class Seller(SellerCreate):
    id: int

# [3] 임시 데이터 저장(향후 DB로 변경)
sellers = []
seller_counter = 1

# [4] 입점사 등록 (id 자동 생성)
@app.post("/sellers", response_model=Seller)
def create_seller(seller: SellerCreate):
    global seller_counter
    # name 중복 체크(실무 필수)
    for s in sellers:
        if s.name == seller.name:
            raise HTTPException(status_code=400, detail="이미 존재하는 입점사명입니다.")
    new_seller = Seller(id=seller_counter, name=seller.name, contact=seller.contact)
    sellers.append(new_seller)
    seller_counter += 1
    return new_seller

# [5] 전체 조회
@app.get("/sellers", response_model=list[Seller])
def get_sellers():
    return sellers

# [6] 단건 조회
@app.get("/sellers/{seller_id}", response_model=Seller)
def get_seller(seller_id: int):
    for s in sellers:
        if s.id == seller_id:
            return s
    raise HTTPException(status_code=404, detail="입점사 없음")

# [7] 수정(입점사명 중복 체크)
@app.put("/sellers/{seller_id}", response_model=Seller)
def update_seller(seller_id: int, seller: SellerCreate):
    for idx, s in enumerate(sellers):
        if s.id == seller_id:
            # 이름 중복체크(자기 자신 제외)
            for other in sellers:
                if other.name == seller.name and other.id != seller_id:
                    raise HTTPException(status_code=400, detail="이미 존재하는 입점사명입니다.")
            sellers[idx] = Seller(id=seller_id, name=seller.name, contact=seller.contact)
            return sellers[idx]
    raise HTTPException(status_code=404, detail="입점사 없음")

# [8] 삭제
@app.delete("/sellers/{seller_id}")
def delete_seller(seller_id: int):
    for idx, s in enumerate(sellers):
        if s.id == seller_id:
            sellers.pop(idx)
            return {"ok": True}
    raise HTTPException(status_code=404, detail="입점사 없음")

# ---- [제품 데이터 구조] ----

class ProductBase(BaseModel):
    name: str
    product_code: str
    seller_id: int
    supply_price: int
    sale_price: int
    stock_in: int

class Product(ProductBase):
    id: int
    thumbnail_url: Optional[str] = None
    detail_image_url: Optional[str] = None

class ProductWithSellerName(Product):
    seller_name: Optional[str] = None

products: List[Product] = []
product_counter = 1

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ---- [제품 등록] ----
@app.post("/products", response_model=Product)
async def create_product(
    name: str = Form(...),
    product_code: str = Form(...),
    seller_id: int = Form(...),
    supply_price: int = Form(...),
    sale_price: int = Form(...),
    stock_in: int = Form(...),
    thumbnail: UploadFile = File(...),
    detail_image: UploadFile = File(...)
):
    global product_counter

    # 1. 공급사(입점사) 체크
    if not any(s.id == seller_id for s in sellers):
        raise HTTPException(status_code=400, detail="존재하지 않는 입점사입니다.")

    # 2. 제품코드 중복 체크
    if any(p.product_code == product_code for p in products):
        raise HTTPException(status_code=400, detail="이미 존재하는 제품코드입니다.")

    # 3. 파일 저장 (썸네일)
    thumb_path = os.path.join(UPLOAD_DIR, f"thumb_{product_counter}_{thumbnail.filename}")
    with open(thumb_path, "wb") as f:
        f.write(await thumbnail.read())

    # 4. 파일 저장 (상세페이지)
    detail_path = os.path.join(UPLOAD_DIR, f"detail_{product_counter}_{detail_image.filename}")
    with open(detail_path, "wb") as f:
        f.write(await detail_image.read())

    # 5. DB(임시) 등록
    product = Product(
        id=product_counter,
        name=name,
        product_code=product_code,
        seller_id=seller_id,
        supply_price=supply_price,
        sale_price=sale_price,
        stock_in=stock_in,
        thumbnail_url=thumb_path,
        detail_image_url=detail_path,
    )
    products.append(product)
    product_counter += 1
    return product

# ---- [제품 전체 조회] ----
@app.get("/products", response_model=List[ProductWithSellerName])
def get_products():
    result = []
    for p in products:
        seller = next((s for s in sellers if s.id == p.seller_id), None)
        seller_name = seller.name if seller else None
        product_dict = p.dict()
        product_dict["seller_name"] = seller_name
        result.append(ProductWithSellerName(**product_dict))
    return result


# ---- [제품 상세 조회] ----
@app.get("/products/{product_id}", response_model=ProductWithSellerName)
def get_product(product_id: int):
    for p in products:
        if p.id == product_id:
            seller = next((s for s in sellers if s.id == p.seller_id), None)
            seller_name = seller.name if seller else None
            product_dict = p.dict()
            product_dict["seller_name"] = seller_name
            return ProductWithSellerName(**product_dict)
    raise HTTPException(status_code=404, detail="제품 없음")


# ---- [제품 수정] ----
@app.put("/products/{product_id}", response_model=Product)
def update_product(product_id: int, product: ProductBase):
    for idx, p in enumerate(products):
        if p.id == product_id:
            # 공급사 체크
            if not any(s.id == product.seller_id for s in sellers):
                raise HTTPException(status_code=400, detail="존재하지 않는 입점사입니다.")
            # 제품코드 중복 체크(자기 자신 제외)
            for other in products:
                if other.product_code == product.product_code and other.id != product_id:
                    raise HTTPException(status_code=400, detail="이미 존재하는 제품코드입니다.")
            updated = Product(id=product_id, **product.dict())
            updated.thumbnail_url = p.thumbnail_url  # 기존 파일 유지
            updated.detail_image_url = p.detail_image_url
            products[idx] = updated
            return updated
    raise HTTPException(status_code=404, detail="제품 없음")

# ---- [제품 삭제] ----
@app.delete("/products/{product_id}")
def delete_product(product_id: int):
    for idx, p in enumerate(products):
        if p.id == product_id:
            # 실제 파일도 삭제(실무)
            if p.thumbnail_url and os.path.exists(p.thumbnail_url):
                os.remove(p.thumbnail_url)
            if p.detail_image_url and os.path.exists(p.detail_image_url):
                os.remove(p.detail_image_url)
            products.pop(idx)
            return {"ok": True}
    raise HTTPException(status_code=404, detail="제품 없음")

@app.post("/orders/upload")
async def upload_orders(file: UploadFile = File(...)):
    temp_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(temp_path, "wb") as f:
        f.write(await file.read())
    
    # 1. 엑셀 파싱 + 병합셀 빈값 보정
    df = pd.read_excel(temp_path, header=0, dtype=str)
    df = df.fillna(method='ffill')   # ← 이 한 줄이 핵심!

    # 2. 주문번호+제품번호 기준 dict로 최신화
    orders_dict = {}
    for idx, row in df.iterrows():
        if row['C'] != '跨境':
            continue
        order_no = row['D']
        product_code = row['Y']
        unique_key = (order_no, product_code)
        prod = next((p for p in products if p.product_code == product_code), None)
        if not prod:
            continue
        orders_dict[unique_key] = {
            "order_no": order_no,
            "buyer_id": row['T'],
            "order_time": row['U'],
            "product_code": product_code,
            "product_name": prod.name,
            "seller_id": prod.seller_id,
            "seller_name": next((s.name for s in sellers if s.id == prod.seller_id), None),
            "qty": int(row['AA']),
            "order_status": row['AV'],
            "supply_price": prod.supply_price,
            "sale_price": prod.sale_price,
            "total_supply": prod.supply_price * int(row['AA']),
            "total_sale": prod.sale_price * int(row['AA']),
        }
    # 3. 통계 집계 (주문상태 최신값 반영)
    summary = {}
    for order in orders_dict.values():
        if order['order_status'] in ["已取消", "退款/售后"]:
            continue
        key = (order['seller_name'], order['product_name'])
        if key not in summary:
            summary[key] = {
                "판매수량": 0,
                "누적매출": 0,
                "누적공급가총액": 0
            }
        summary[key]["판매수량"] += order['qty']
        summary[key]["누적매출"] += order['total_sale']
        summary[key]["누적공급가총액"] += order['total_supply']

    return {
        "통계_요약": summary,
        "상세주문_리스트": list(orders_dict.values())
    }

# ... Account, get_password_hash 등 클래스/함수 정의 뒤에

accounts = [
    Account(
        id=1,
        username="abladmin",
        password_hash=get_password_hash("abl1234"),
        type="admin",
        seller_id=None
    )
]
account_counter = 2

# 관리자 권한 체크
def admin_only(current: Account = Depends(get_current_account)):
    if current.type != "admin":
        raise HTTPException(status_code=403, detail="관리자만 접근 가능")
    return current

# 계정 생성 (관리자만 가능)
@app.post("/accounts", response_model=Account)
def create_account(account: AccountCreate, current: Account = Depends(admin_only)):
    global account_counter
    if get_account_by_username(account.username):
        raise HTTPException(status_code=400, detail="이미 존재하는 아이디")
    if account.type == "seller" and not any(s.id == account.seller_id for s in sellers):
        raise HTTPException(status_code=400, detail="존재하지 않는 입점사 id")
    acc = Account(
        id=account_counter,
        username=account.username,
        password_hash=get_password_hash(account.password),
        type=account.type,
        seller_id=account.seller_id
    )
    accounts.append(acc)
    account_counter += 1
    return acc

# 계정 수정 (관리자만)
@app.put("/accounts/{account_id}", response_model=Account)
def update_account(account_id: int, update: AccountUpdate, current: Account = Depends(admin_only)):
    for acc in accounts:
        if acc.id == account_id:
            if update.password:
                acc.password_hash = get_password_hash(update.password)
            if update.type:
                acc.type = update.type
            if update.seller_id is not None:
                acc.seller_id = update.seller_id
            return acc
    raise HTTPException(status_code=404, detail="계정 없음")

# 계정 삭제 (관리자만)
@app.delete("/accounts/{account_id}")
def delete_account(account_id: int, current: Account = Depends(admin_only)):
    for idx, acc in enumerate(accounts):
        if acc.id == account_id:
            accounts.pop(idx)
            return {"ok": True}
    raise HTTPException(status_code=404, detail="계정 없음")

# 계정 리스트 조회 (관리자만)
@app.get("/accounts", response_model=List[Account])
def list_accounts(current: Account = Depends(admin_only)):
    return accounts
