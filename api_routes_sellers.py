from typing import List, Optional
from decimal import Decimal
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, case

from models import Seller, Product, Order, OrderItem, Account  # Account 추가
from db import get_db
from auth import get_current_account, admin_only
from crud import VALID_STATUS_FOR_STATS, get_korea_time_naive
from schemas import SellerCreate, SellerOut  # 추가!

router = APIRouter()


# === Sellers CRUD ===
@router.post("/sellers", response_model=SellerOut)
def create_seller(seller: SellerCreate, db: Session = Depends(get_db), current: Account = Depends(admin_only)):
    if db.query(Seller).filter(Seller.name == seller.name).first():
        raise HTTPException(status_code=400, detail="이미 존재하는 입점사명")
    new = Seller(name=seller.name, contact=seller.contact)
    db.add(new)
    db.commit()
    db.refresh(new)
    return new

@router.get("/sellers")
def list_sellers(db: Session = Depends(get_db), current: Account = Depends(get_current_account)):
    from sqlalchemy import func, case, text
    
    # 제품 수 계산
    sellers_with_count = db.query(
        Seller,
        func.count(Product.id).label('total_product_count'),
        func.sum(case((Product.is_active == 1, 1), else_=0)).label('active_product_count')
    ).outerjoin(
        Product, 
        Seller.id == Product.seller_id
    ).group_by(Seller.id).all()
    
    result = []
    for seller, total_count, active_count in sellers_with_count:
        # 판매 통계 계산
        sales_stats = db.query(
            func.sum(OrderItem.quantity).label('total_quantity'),
            func.sum(OrderItem.quantity * OrderItem.supply_price).label('total_amount')
        ).join(
            Order, OrderItem.order_id == Order.id
        ).filter(
            OrderItem.seller_id_snapshot == seller.id,
            Order.status.in_(VALID_STATUS_FOR_STATS)
        ).first()
        
        seller_dict = {
            "id": seller.id,
            "name": seller.name,
            "contact": seller.contact,
            "total_product_count": total_count or 0,
            "active_product_count": active_count or 0,
            "total_sales_amount": float(sales_stats.total_amount or 0),
            "total_sales_quantity": sales_stats.total_quantity or 0,
            "created_at": seller.created_at,
            "updated_at": seller.updated_at
        }
        result.append(seller_dict)
    
    return result
@router.get("/sellers/{seller_id}", response_model=SellerOut)
def get_seller(seller_id: int, db: Session = Depends(get_db), current: Account = Depends(get_current_account)):
    s = db.query(Seller).filter(Seller.id == seller_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="입점사 없음")
    return s

@router.put("/sellers/{seller_id}", response_model=SellerOut)
def update_seller(seller_id: int, body: SellerCreate, db: Session = Depends(get_db), current: Account = Depends(admin_only)):
    s = db.query(Seller).filter(Seller.id == seller_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="입점사 없음")
    if db.query(Seller).filter(Seller.name == body.name, Seller.id != seller_id).first():
        raise HTTPException(status_code=400, detail="이미 존재하는 입점사명")
    s.name = body.name
    s.contact = body.contact
    db.commit()
    db.refresh(s)
    return s

@router.delete("/sellers/{seller_id}")
def delete_seller(seller_id: int, db: Session = Depends(get_db), current: Account = Depends(admin_only)):
    seller = db.query(Seller).filter(Seller.id == seller_id).first()
    if not seller:
        raise HTTPException(status_code=404, detail="입점사 없음")
    db.delete(seller)
    db.commit()
    return {"ok": True, "message": "입점사가 삭제되었습니다"}
