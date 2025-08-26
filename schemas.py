from typing import Optional
from decimal import Decimal
from datetime import datetime
from pydantic import BaseModel, validator
from fastapi import UploadFile  # 추가!

# === Seller Schemas ===
class SellerCreate(BaseModel):
    name: str
    contact: Optional[str] = None

class SellerOut(SellerCreate):
    id: int
    class Config:
        orm_mode = True

# === Product Schemas ===
class ProductBase(BaseModel):
    name: str
    product_code: str
    seller_id: int
    initial_stock: int
    supply_price: Decimal
    sale_price: Decimal
    is_active: Optional[int] = 1

    @validator("supply_price", "sale_price", pre=True)
    def _dec(cls, v):
        return Decimal(str(v))

class ProductCreate(ProductBase):
    thumbnail: Optional[UploadFile] = None
    detail_image: Optional[UploadFile] = None

class ProductOut(ProductBase):
    id: int
    thumbnail_url: Optional[str]
    detail_image_url: Optional[str]
    current_stock: Optional[int] = None  # 현재 재고
    class Config:
        orm_mode = True

# === Account Schemas ===
class AccountBase(BaseModel):
    username: str
    type: str  # "admin" or "seller"
    seller_id: Optional[int] = None

class AccountCreate(AccountBase):
    password: str

class AccountUpdate(BaseModel):
    password: Optional[str] = None
    type: Optional[str] = None
    seller_id: Optional[int] = None

class AccountOut(AccountBase):
    id: int
    created_at: datetime
    class Config:
        orm_mode = True