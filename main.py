import os
from fastapi import FastAPI, HTTPException, Depends, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import hashlib
import hmac
import uuid
from datetime import datetime, timezone
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

# 라우터 import
from auth import router as auth_router, get_current_account  # get_current_account 추가
from api_routes_sellers import router as sellers_router
from api_routes_products import router as products_router
from api_routes_accounts import router as accounts_router
from api_routes_orders import router as orders_router
from api_routes_dashboard import router as dashboard_router

from crud import UPLOAD_DIR  # crud에서 가져오기
# 라우터 import 부분 바로 아래에 추가

from models import Account  # Account 모델 추가
# FastAPI 앱 생성 (반드시 라우터 등록 전에!)
from api_routes_shipments import router as shipments_router

app = FastAPI()




# === 환경 설정 ===
ENV = os.getenv("ENVIRONMENT", "development")

# === CORS 설정 ===
if ENV == "development":
    origins = ["*"]
else:
    origins = [
        "https://ablcrossborder-production.up.railway.app",  # Railway 자체 도메인
        "http://localhost:3000",  # 로컬 테스트용
        "http://localhost:8000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === 라우터 등록 (한 번만!) ===
app.include_router(auth_router)
app.include_router(sellers_router)
app.include_router(products_router)
app.include_router(accounts_router)
app.include_router(orders_router)
app.include_router(dashboard_router)
app.include_router(products_router, prefix="/api")  # prefix 확인
app.include_router(shipments_router, prefix="/api")

# === 정적 파일 서빙 ===
if os.path.exists("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")
    print("✅ Static 폴더 마운트 성공")
else:
    print("❌ Static 폴더 없음!")

# 기존 코드 아래에 추가
# 기존 코드 아래에 추가
IMAGEKIT_PRIVATE_KEY = os.getenv("IMAGEKIT_PRIVATE_KEY")
IMAGEKIT_PUBLIC_KEY = os.getenv("IMAGEKIT_PUBLIC_KEY")
IMAGEKIT_URL_ENDPOINT = os.getenv("IMAGEKIT_URL_ENDPOINT")

from imagekitio import ImageKit

imagekit = ImageKit(
    private_key=IMAGEKIT_PRIVATE_KEY,
    public_key=IMAGEKIT_PUBLIC_KEY,
    url_endpoint=IMAGEKIT_URL_ENDPOINT
)

app.state.imagekit = imagekit
# === 기본 엔드포인트 ===
@app.get("/")
async def read_index():
    file_path = "static/login.html"
    if os.path.exists(file_path):
        return FileResponse(file_path)
    else:
        return {"error": f"파일 없음: {file_path}"}

@app.get("/index")
async def read_main():
    return FileResponse('static/index.html')

@app.get("/static/uploads/{filename}")
async def get_upload_file(filename: str):
    file_path = os.path.join(UPLOAD_DIR, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/health")
def health_check():
    """서버 상태 확인용"""
    return {"status": "healthy", "environment": ENV}

from fastapi import Request  # 이거 추가!

@app.get("/api/imagekit/auth")
def get_imagekit_auth():
    import time
    
    private_key = "private_a7o7oucjcWpmvmydF7yQBbZREdU="
    
    # UUID와 만료 시간
    token = str(uuid.uuid4())
    expire = str(int(time.time() + 1800))
    
    # ImageKit 공식: token과 expire를 단순 연결 (구분자 없음!)
    auth_str = token + expire  # 중요: "+" 연결, "&" 없음!
    
    # HMAC-SHA1 서명
    signature = hmac.new(
        private_key.encode('utf-8'),
        auth_str.encode('utf-8'),
        hashlib.sha1
    ).hexdigest()
    
    print(f"Auth String: {auth_str}")
    print(f"Signature: {signature}")
    
    return {
        "token": token,
        "expire": expire,
        "signature": signature
    }

@app.delete("/api/imagekit/delete")
async def delete_from_imagekit(url: str = Form(...)):
    import requests
    import base64
    
    # URL에서 파일 ID 추출
    # 예: https://ik.imagekit.io/ndn2bdvdd/products/detail_00_8_1756113088426_zpj6CgHA0.jpg
    parts = url.split('/')
    file_path = '/'.join(parts[4:])  # products/detail_00_8_...
    
    # ImageKit API 호출
    private_key = "private_a7o7oucjcWpmvmydF7yQBbZREdU="
    
    # 먼저 파일 검색
    search_url = f"https://api.imagekit.io/v1/files?path={file_path}"
    auth = base64.b64encode(f"{private_key}:".encode()).decode()
    
    headers = {
        "Authorization": f"Basic {auth}"
    }
    
    response = requests.get(search_url, headers=headers)
    if response.status_code == 200:
        files = response.json()
        if files:
            file_id = files[0]['fileId']
            
            # 파일 삭제
            delete_url = f"https://api.imagekit.io/v1/files/{file_id}"
            delete_response = requests.delete(delete_url, headers=headers)
            
            if delete_response.status_code == 204:
                return {"ok": True, "message": "이미지 삭제 완료"}
    
    return {"ok": False, "message": "이미지 삭제 실패"}

# main.py에 추가
@app.get("/api/imagekit/auth")
async def get_imagekit_auth(current_account: Account = Depends(get_current_account)):
    """ImageKit 업로드 인증 정보 반환"""
    auth_params = imagekit.get_authentication_parameters()
    
    # publicKey도 함께 전송
    return {
        "token": auth_params.token,
        "expire": auth_params.expire,
        "signature": auth_params.signature,
        "publicKey": IMAGEKIT_PUBLIC_KEY  # 환경변수에서 가져온 값
    }