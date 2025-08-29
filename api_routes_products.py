import os
from os.path import basename
from typing import List, Optional
from decimal import Decimal
from datetime import datetime
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from models import Product, Seller, Order, OrderItem, StockAdjustment, Account  # Account 추가
from db import get_db
from auth import get_current_account, admin_only
from crud import get_korea_time_naive, DEDUCT_STOCK_STATUSES, UPLOAD_DIR
from schemas import ProductBase, ProductOut
from models import ProductImage  # 상단 import에 추가
import json  # 상단 import에 추가
from models import ProductCodeMapping
from models import Product, Seller, Order, OrderItem, StockAdjustment, Account, ProductShipment, ShipmentPriceHistory


router = APIRouter()

# 제품 생성/수정 시 created_at, updated_at은 get_korea_time_naive() 사용
# 재고 조정 시 adjusted_at, created_at도 get_korea_time_naive() 사용

# === Products CRUD ===
@router.post("/products", response_model=ProductOut)
async def create_product(
    name: str = Form(...),
    product_code: str = Form(...),
    seller_id: int = Form(...),
    initial_stock: int = Form(0),  # 기본값 0으로 변경
    supply_price: str = Form("0"),  # 기본값 0
    sale_price: str = Form("0"),    # 기본값 0
    is_active: int = Form(1),
    thumbnail_url: str = Form(None),
    detail_image_url: str = Form(None),
    # 선적 정보 (JSON 문자열로 받음)
    shipments: str = Form(None),
    db: Session = Depends(get_db),
    current: Account = Depends(admin_only)
):
    if not db.query(Seller).filter(Seller.id == seller_id).first():
        raise HTTPException(status_code=400, detail="입점사 없음")

    if db.query(Product).filter(Product.product_code == product_code).first():
            raise HTTPException(status_code=400, detail="이미 존재하는 제품코드")
    
    korea_time = get_korea_time_naive()
    
    # 선적 정보 파싱
    shipment_list = []
    if shipments:
        import json
        try:
            shipment_list = json.loads(shipments)
        except:
            raise HTTPException(status_code=400, detail="선적 정보 형식 오류")
    
    # 선적이 있으면 첫 번째 선적 기준으로 가격 설정
    if shipment_list:
        supply_price = str(shipment_list[0].get('supply_price', 0))
        sale_price = str(shipment_list[0].get('sale_price', 0))
        initial_stock = sum(s.get('quantity', 0) for s in shipment_list)

    prod = Product(
        name=name,
        product_code=product_code,
        seller_id=seller_id,
        initial_stock=initial_stock,
        supply_price=Decimal(supply_price),
        sale_price=Decimal(sale_price),
        is_active=is_active,
        thumbnail_url=thumbnail_url,
        detail_image_url=detail_image_url,
        created_at=korea_time,
        updated_at=korea_time
    )
    db.add(prod)
    db.flush()  # ID 생성
    
    # 선적 정보 저장
    for ship_data in shipment_list:
        shipment = ProductShipment(
            product_id=prod.id,
            shipment_no=ship_data.get('shipment_no', '초기재고'),
            arrival_date=datetime.strptime(ship_data.get('arrival_date', str(datetime.now().date())), '%Y-%m-%d').date() if ship_data.get('arrival_date') else get_korea_time_naive().date(),
            initial_quantity=ship_data.get('quantity', 0),
            current_quantity=ship_data.get('quantity', 0),
            remaining_quantity=ship_data.get('quantity', 0),
            supply_price=Decimal(str(ship_data.get('supply_price', 0))),
            sale_price=Decimal(str(ship_data.get('sale_price', 0))),
            is_active=1,
            created_by=current.id,
            created_at=korea_time,
            updated_at=korea_time
        )
        db.add(shipment)
        db.flush()
        
        # 초기 가격 이력
        price_history = ShipmentPriceHistory(
            shipment_id=shipment.id,
            supply_price=Decimal(str(ship_data.get('supply_price', 0))),
            sale_price=Decimal(str(ship_data.get('sale_price', 0))),
            effective_date=shipment.arrival_date,
            reason="초기 등록",
            changed_by=current.id,
            created_at=korea_time
        )
        db.add(price_history)
    
    # 미연결 OrderItem 업데이트 (기존 코드 유지)
    updated_count = db.query(OrderItem).filter(
        OrderItem.product_code == product_code,
        OrderItem.supply_price == 0,
        OrderItem.sale_price == 0
    ).update({
        "product_id": prod.id,
        "seller_id_snapshot": prod.seller_id,
        "supply_price": prod.supply_price,
        "sale_price": prod.sale_price
    })
    
    db.commit()
    
    if updated_count > 0:
         print(f"✅ {updated_count}개 미연결 주문 가격 자동 설정")
    
    return prod

# main.py의 제품 목록 조회 부분만 수정
# 기존의 중복된 /products 엔드포인트를 하나로 통합

@router.get("/products", response_model=List[ProductOut])
def list_products(
    include_inactive: int = 0,
    db: Session = Depends(get_db),
    current: Account = Depends(get_current_account)
):
    q = db.query(Product)
    if not include_inactive:
        q = q.filter(Product.is_active == 1)
    
    products = q.all()
    
    # 각 제품의 현재 가격/재고 계산 (선적 기준)
    for product in products:
        # 현재 판매 가능한 가장 오래된 선적 찾기
        current_shipment = db.query(ProductShipment).filter(
            ProductShipment.product_id == product.id,
            ProductShipment.remaining_quantity > 0,
            ProductShipment.is_active == 1
        ).order_by(ProductShipment.arrival_date.asc()).first()
        
        if current_shipment:
            # 현재 가격 = 가장 오래된 활성 선적 가격
            product.supply_price = current_shipment.supply_price
            product.sale_price = current_shipment.sale_price
            
        # 총 재고 = 모든 활성 선적의 remaining_quantity 합
        total_stock = db.query(func.sum(ProductShipment.remaining_quantity)).filter(
            ProductShipment.product_id == product.id,
            ProductShipment.is_active == 1
        ).scalar() or 0
        
        product.current_stock = total_stock
    
    return products

@router.get("/products/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db), current: Account = Depends(get_current_account)):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="제품 없음")
    
    # 현재 가격 (가장 오래된 활성 선적)
    current_shipment = db.query(ProductShipment).filter(
        ProductShipment.product_id == product_id,
        ProductShipment.remaining_quantity > 0,
        ProductShipment.is_active == 1
    ).order_by(ProductShipment.arrival_date.asc()).first()
    
    if current_shipment:
        p.supply_price = current_shipment.supply_price
        p.sale_price = current_shipment.sale_price
    
    # 총 재고
    p.current_stock = db.query(func.sum(ProductShipment.remaining_quantity)).filter(
        ProductShipment.product_id == product_id,
        ProductShipment.is_active == 1
    ).scalar() or 0
    
    return p

@router.put("/products/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: int,
    name: str = Form(None),
    product_code: str = Form(None),
    seller_id: int = Form(None),
    initial_stock: int = Form(None),
    supply_price: str = Form(None),
    sale_price: str = Form(None),
    is_active: int = Form(None),
    thumbnail_url: str = Form(None),      # 추가
    detail_image_url: str = Form(None),   # 추가
    db: Session = Depends(get_db),
    current: Account = Depends(admin_only)
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="제품 없음")

    # 제품코드 중복 체크 (자기 자신 제외)
    if product_code and db.query(Product).filter(
        Product.product_code == product_code, 
        Product.id != product_id
    ).first():
        raise HTTPException(status_code=400, detail="이미 존재하는 제품코드")

    # 각 필드 업데이트 (None이 아닌 값만)
    if name is not None:
        p.name = name
    if product_code is not None:
        p.product_code = product_code
    if seller_id is not None:
        p.seller_id = seller_id
    if initial_stock is not None:
        p.initial_stock = initial_stock
    if supply_price is not None:
        p.supply_price = Decimal(str(supply_price))
    if sale_price is not None:
        p.sale_price = Decimal(str(sale_price))
    if is_active is not None:
        p.is_active = is_active
    if thumbnail_url is not None:
        p.thumbnail_url = thumbnail_url        # URL 업데이트
    if detail_image_url is not None:
        p.detail_image_url = detail_image_url  # URL 업데이트
    
    p.updated_at = get_korea_time_naive()

    db.commit()
    db.refresh(p)
    
    print(f"✅ 제품 {product_id} 업데이트 완료")
    print(f"   - thumbnail_url: {p.thumbnail_url}")
    print(f"   - detail_image_url: {p.detail_image_url}")
    
    return p

@router.delete("/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db), current: Account = Depends(admin_only)):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="제품 없음")
    
    # order_items의 product_id를 NULL로 변경 (연결 해제)
    db.query(OrderItem).filter(OrderItem.product_id == product_id).update(
        {"product_id": None}
    )
    
    # 제품 완전 삭제
    db.delete(p)
    db.commit()
    return {"ok": True, "message": "제품이 완전히 삭제되었습니다"}


@router.post("/products/{product_id}/stock-adjust")
def adjust_stock(
    product_id: int,
    adjustment_type: str = Form(...),
    quantity: int = Form(...),
    note: str = Form(...),
    db: Session = Depends(get_db),
    current: Account = Depends(admin_only)
):
    # 선적 시스템으로 대체됨
    raise HTTPException(
        status_code=400, 
        detail="재고 조정은 선적 관리에서 처리하세요. /api/shipments/{shipment_id}/adjust-stock"
    )




# 추가 이미지 저장
# 파일 맨 끝에 이 두 함수 추가
@router.post("/products/{product_id}/images")
async def save_product_images(
    product_id: int,
    images: str = Form(...),
    db: Session = Depends(get_db),
    current: Account = Depends(admin_only)
):
    try:
        db.query(ProductImage).filter(ProductImage.product_id == product_id).delete()
        image_list = json.loads(images)
        for img_data in image_list[:10]:
            new_image = ProductImage(
                product_id=product_id,
                image_url=img_data['url'],
                display_order=img_data.get('order', 0)
            )
            db.add(new_image)
        db.commit()
        return {"ok": True, "count": len(image_list)}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/products/{product_id}/images")
def get_product_images(
    product_id: int,
    db: Session = Depends(get_db)
):
    images = db.query(ProductImage).filter(
        ProductImage.product_id == product_id
    ).order_by(ProductImage.display_order).all()
    return [{"url": img.image_url, "order": img.display_order} for img in images]

@router.post("/products/{product_id}/mappings")
def add_product_mapping(
    product_id: int,
    mapped_code: str = Form(...),
    quantity_multiplier: int = Form(1),
    mapping_type: str = Form('alias'),
    note: str = Form(None),
    db: Session = Depends(get_db),
    current: Account = Depends(admin_only)
):
    # 제품 존재 확인
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="제품 없음")
    
    # 중복 체크
    existing_product = db.query(Product).filter(Product.product_code == mapped_code).first()
    existing_mapping = db.query(ProductCodeMapping).filter(
        ProductCodeMapping.mapped_code == mapped_code
    ).first()
    
    if existing_product or existing_mapping:
        raise HTTPException(status_code=400, detail="이미 사용중인 제품코드")
    
    mapping = ProductCodeMapping(
        product_id=product_id,
        mapped_code=mapped_code,
        quantity_multiplier=quantity_multiplier,
        mapping_type=mapping_type,
        note=note
    )
    db.add(mapping)
    db.commit()
    
    # 미확인 주문들 가져오기 (update 대신 select)
    unmatched_items = db.query(OrderItem).filter(
        OrderItem.product_code == mapped_code,
        OrderItem.product_id == None
    ).all()
    
    # 각 아이템 업데이트
    updated_count = 0
    for item in unmatched_items:
        item.product_id = product.id
        item.seller_id_snapshot = product.seller_id
        item.quantity = item.quantity * quantity_multiplier
        
        if item.supply_price == 0:
            item.supply_price = product.supply_price
            item.sale_price = product.sale_price
        
        updated_count += 1
    
    db.commit()
    
    # 통계 재계산
    if unmatched_items:
        from crud import update_dashboard_summary, update_product_rankings
        
        update_dashboard_summary(db, unmatched_items)
        
        affected_sellers = set()
        for item in unmatched_items:
            if item.seller_id_snapshot:
                affected_sellers.add(item.seller_id_snapshot)
        
        for seller_id in affected_sellers:
            update_product_rankings(db, seller_id)
        
        update_product_rankings(db)  # 전체 랭킹
    
    return {
        "success": True, 
        "message": f"매핑 추가 완료, {updated_count}개 주문 연결 및 통계 업데이트됨"
    }

# 매핑 목록 조회
@router.get("/products/{product_id}/mappings")
def get_product_mappings(
    product_id: int,
    db: Session = Depends(get_db),
    current: Account = Depends(get_current_account)
):
    mappings = db.query(ProductCodeMapping).filter(
        ProductCodeMapping.product_id == product_id
    ).all()
    
    return [{
        "id": m.id,
        "mapped_code": m.mapped_code,
        "quantity_multiplier": m.quantity_multiplier,
        "mapping_type": m.mapping_type,
        "note": m.note
    } for m in mappings]

# 매핑 삭제
@router.delete("/products/mappings/{mapping_id}")
def delete_product_mapping(
    mapping_id: int,
    db: Session = Depends(get_db),
    current: Account = Depends(admin_only)
):
    mapping = db.query(ProductCodeMapping).filter(
        ProductCodeMapping.id == mapping_id
    ).first()
    
    if not mapping:
        raise HTTPException(status_code=404, detail="매핑 없음")
    
    db.delete(mapping)
    db.commit()
    
    return {"success": True}