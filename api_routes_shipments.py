from typing import List, Optional
from decimal import Decimal
from datetime import datetime, date
from fastapi import APIRouter, HTTPException, Depends, Form
from sqlalchemy.orm import Session
from sqlalchemy import func

from models import ProductShipment, ShipmentPriceHistory, ShipmentStockAdjustment, Product, Account
from db import get_db
from auth import get_current_account, admin_only
from crud import get_korea_time_naive

router = APIRouter()

# 선적 목록 조회
@router.get("/products/{product_id}/shipments")
def get_product_shipments(
    product_id: int,
    db: Session = Depends(get_db),
    current: Account = Depends(get_current_account)
):
    shipments = db.query(ProductShipment).filter(
        ProductShipment.product_id == product_id,
        ProductShipment.is_active == 1
    ).order_by(ProductShipment.arrival_date.asc()).all()
    
    result = []
    for s in shipments:
        result.append({
            "id": s.id,
            "shipment_no": s.shipment_no,
            "arrival_date": s.arrival_date.isoformat(),
            "initial_quantity": s.initial_quantity,
            "current_quantity": s.current_quantity,
            "remaining_quantity": s.remaining_quantity,
            "supply_price": float(s.supply_price),
            "sale_price": float(s.sale_price)
        })
    
    return result

# 선적 추가
@router.post("/products/{product_id}/shipments")
def add_shipment(
    product_id: int,
    shipment_no: str = Form(...),
    arrival_date: str = Form(None),
    quantity: int = Form(...),
    supply_price: float = Form(...),
    sale_price: float = Form(...),
    db: Session = Depends(get_db),
    current: Account = Depends(admin_only)
):
    # 날짜 처리
    if arrival_date:
        arrival = datetime.strptime(arrival_date + ' 00:00:00', '%Y-%m-%d %H:%M:%S')
    else:
        arrival = get_korea_time_naive()
    
    shipment = ProductShipment(
        product_id=product_id,
        shipment_no=shipment_no,
        arrival_date=arrival,
        initial_quantity=quantity,
        current_quantity=quantity,
        remaining_quantity=quantity,
        supply_price=Decimal(str(supply_price)),
        sale_price=Decimal(str(sale_price)),
        is_active=1,
        created_by=current.id,
        created_at=get_korea_time_naive(),
        updated_at=get_korea_time_naive()
    )
    db.add(shipment)
    db.flush()
    
    # 초기 가격 이력 저장
    price_history = ShipmentPriceHistory(
        shipment_id=shipment.id,
        supply_price=Decimal(str(supply_price)),
        sale_price=Decimal(str(sale_price)),
        effective_date=arrival,
        reason="초기 등록",
        changed_by=current.id,
        created_at=get_korea_time_naive()
    )
    db.add(price_history)
    
    db.commit()
    return {"success": True, "shipment_id": shipment.id}

# 선적 가격 수정
@router.put("/shipments/{shipment_id}/price")
def update_shipment_price(
    shipment_id: int,
    supply_price: float = Form(...),
    sale_price: float = Form(...),
    reason: str = Form(None),
    effective_date: str = Form(None),
    db: Session = Depends(get_db),
    current: Account = Depends(admin_only)
):
    shipment = db.query(ProductShipment).filter(ProductShipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="선적을 찾을 수 없습니다")
    
    # 날짜 처리
    if effective_date:
        eff_date = datetime.strptime(effective_date + ' 00:00:00', '%Y-%m-%d %H:%M:%S')
    else:
        eff_date = get_korea_time_naive()
    
    # 가격 이력 저장
    history = ShipmentPriceHistory(
        shipment_id=shipment_id,
        supply_price=Decimal(str(supply_price)),
        sale_price=Decimal(str(sale_price)),
        effective_date=eff_date,
        reason=reason or "가격 수정",
        changed_by=current.id,
        created_at=get_korea_time_naive()
    )
    db.add(history)
    
    # 현재 가격 업데이트
    shipment.supply_price = Decimal(str(supply_price))
    shipment.sale_price = Decimal(str(sale_price))
    shipment.updated_at = get_korea_time_naive()
    
    db.commit()
    return {"success": True}

# 선적 재고 조정
@router.post("/shipments/{shipment_id}/adjust-stock")
def adjust_shipment_stock(
    shipment_id: int,
    adjustment_type: str = Form(...),  # 'add' or 'subtract'
    quantity: int = Form(...),
    reason: str = Form(...),
    db: Session = Depends(get_db),
    current: Account = Depends(admin_only)
):
    shipment = db.query(ProductShipment).filter(ProductShipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="선적을 찾을 수 없습니다")
    
    # 수량 조정
    if adjustment_type == 'add':
        delta = quantity
        shipment.current_quantity += quantity
        shipment.remaining_quantity += quantity
    else:  # subtract
        delta = -quantity
        if shipment.remaining_quantity < quantity:
            raise HTTPException(status_code=400, detail="재고가 부족합니다")
        shipment.current_quantity -= quantity
        shipment.remaining_quantity -= quantity
    
    # 조정 이력 저장
    adjustment = ShipmentStockAdjustment(
        shipment_id=shipment_id,
        adjustment_type=adjustment_type,
        quantity_delta=delta,
        reason=reason,
        adjusted_by=current.id,
        adjusted_at=get_korea_time_naive()
    )
    db.add(adjustment)
    
    shipment.updated_at = get_korea_time_naive()
    db.commit()
    
    return {"success": True, "new_quantity": shipment.remaining_quantity}

@router.get("/shipments/{shipment_id}/price-history")
def get_shipment_price_history(
    shipment_id: int,
    db: Session = Depends(get_db),
    current: Account = Depends(get_current_account)
):
    """선적 가격 변동 이력 조회"""
    history = db.query(ShipmentPriceHistory).filter(
        ShipmentPriceHistory.shipment_id == shipment_id
    ).order_by(ShipmentPriceHistory.created_at.desc()).all()
    
    return [{
        "supply_price": float(h.supply_price),
        "sale_price": float(h.sale_price),
        "reason": h.reason,
        "effective_date": h.effective_date.isoformat() if h.effective_date else None,
        "created_at": h.created_at.isoformat() if h.created_at else None
    } for h in history]

@router.get("/shipments/{shipment_id}/stock-history")
def get_shipment_stock_history(
    shipment_id: int,
    db: Session = Depends(get_db),
    current: Account = Depends(get_current_account)
):
    """선적 재고 조정 이력 조회"""
    adjustments = db.query(ShipmentStockAdjustments).filter(
        ShipmentStockAdjustments.shipment_id == shipment_id
    ).order_by(ShipmentStockAdjustments.created_at.desc()).all()
    
    return [{
        "adjustment_type": a.adjustment_type,
        "quantity": a.quantity,
        "reason": a.reason,
        "created_at": a.created_at.isoformat() if a.created_at else None
    } for a in adjustments]