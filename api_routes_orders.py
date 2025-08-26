import hashlib
import pandas as pd
from io import BytesIO
from typing import Optional
from decimal import Decimal
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from sqlalchemy.orm import Session

from models import Order, OrderItem, Product, Seller, ImportBatch, DashboardSummary, Account, OrderItemAudit
from db import get_db
from auth import get_current_account, admin_only
from crud import (
    get_korea_time_naive,
    ORDER_STATUS_MAP, 
    VALID_STATUS_FOR_STATS,
    TOTAL_STATS_SELLER_ID,
    update_dashboard_summary,
    update_product_rankings,
    recalculate_stats_for_status_change,
    recalculate_total_stats,
    get_week_start,
    recalculate_dashboard_summary_full  # ✅ 추가
)

router = APIRouter()

# 주의사항:
# - Order.order_time은 엑셀의 지불시간 그대로 저장 (중국시간)
# - ImportBatch.imported_at은 get_korea_time_naive() 사용 (한국시간)
# - OrderItem.last_modified_at은 get_korea_time_naive() 사용 (한국시간)

# === Orders Upload API ===
@router.post("/upload/orders")
async def upload_orders(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: Account = Depends(admin_only)
):
    # 1. 파일 타입 체크
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="엑셀 파일만 업로드 가능합니다")
    
    # 2. 파일 읽기
    contents = await file.read()
    
    # 3. 파일 해시 계산 (중복 체크용)
    file_hash = hashlib.sha256(contents).hexdigest()
    
    # 4. 이미 업로드된 파일인지 체크
    existing_batch = db.query(ImportBatch).filter(
        ImportBatch.hash == file_hash
    ).first()
    
    if existing_batch:
        return {
            "message": "이미 업로드된 파일입니다",
            "batch_id": existing_batch.id,
            "uploaded_at": existing_batch.imported_at
        }
    
    # 5. 엑셀 파싱
    # 5. 엑셀 파싱 (1행은 헤더, 2행부터 데이터)
    df = pd.read_excel(
     BytesIO(contents),
      header=0,  # 첫 번째 행(0번 인덱스)을 헤더로 사용
     skiprows=None  # 건너뛸 행 없음
)

    # 빈 데이터프레임 체크
    if df.empty:
        raise HTTPException(status_code=400, detail="엑셀 파일에 데이터가 없습니다")
    
    # 6. 컬럼명 매핑 (중국어 → 영어)
    column_mapping = {
        '跨境/非跨境': 'cross_border',
        '订单编号': 'order_no',
        '购买人ID': 'buyer_id',
        '支付时间': 'order_time',
        '商品编码': 'product_code',
        '商品数量': 'quantity',
        '商品金额': 'cny_amount',
        '订单状态': 'status'
    }
    
    # 컬럼명 변경
    df = df.rename(columns=column_mapping)
    
    # 7. 병합 셀 처리 (forward fill)
    fill_columns = ['cross_border', 'order_no', 'buyer_id', 'order_time', 'status']
    for col in fill_columns:
        if col in df.columns:
            df[col] = df[col].ffill()
    
    # 8. 跨境만 필터링
    df_filtered = df[df['cross_border'] == '跨境'].copy()
    
    # 9.  9. 시간 변환 
    df_filtered['order_time'] = pd.to_datetime(df_filtered['order_time'])
    
    # 10. 제품코드 공백 제거
    df_filtered['product_code'] = df_filtered['product_code'].str.strip()
    
    # 11. 통계 초기화
    stats = {
        'total_rows': len(df),
        'cross_border_rows': len(df_filtered),
        'new_orders': 0,
        'updated_orders': 0,
        'new_items': 0,
        'skipped_items': 0,
        'unmatched_products': []
    }
        
    # 12. 제품 정보 미리 로드 (최적화!)
    product_codes = df_filtered['product_code'].unique()
    all_products = {p.product_code: p for p in db.query(Product).filter(Product.product_code.in_(product_codes)).all()}

    # 기존 주문 미리 로드 (최적화!)
    order_nos = df_filtered['order_no'].unique()
    existing_orders = {o.order_no: o for o in db.query(Order).filter(Order.order_no.in_(order_nos)).all()}

    # 13. DB 저장 (주문번호별 그룹)
    new_orders = []
    new_items = []

    for order_no, group in df_filtered.groupby('order_no'):
        first_row = group.iloc[0]
        new_status = first_row['status']
        
        # 기존 주문 체크
        order = existing_orders.get(order_no)
        is_new_order = False
        
        if order:
            # 기존 주문 - 상태 변경시 통계 재계산 추가!
            if order.status != new_status:
                old_status = order.status
                order.status = new_status
                stats['updated_orders'] += 1
                
                # ✅ 영향받은 입점사들 수집
                affected_sellers = set()
                order_items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
                for oi in order_items:
                    if oi.seller_id_snapshot:
                        affected_sellers.add(oi.seller_id_snapshot)
                
                # 상태 변경에 따른 통계 재계산
                db.flush()
                
                # 각 입점사별로 재계산
                from crud import recalculate_dashboard_summary_full, update_product_rankings
                for sid in affected_sellers:
                    recalculate_dashboard_summary_full(db, sid)
                    update_product_rankings(db, sid)
                
                # 전체 통계도 업데이트
                recalculate_dashboard_summary_full(db, TOTAL_STATS_SELLER_ID)
                update_product_rankings(db, TOTAL_STATS_SELLER_ID)
              
        else:
            # 신규 주문
            order = Order(
                order_no=order_no,
                buyer_id=first_row['buyer_id'],
                order_time=first_row['order_time'],
                status=new_status
            )
            db.add(order)
            new_orders.append(order)
            stats['new_orders'] += 1
            is_new_order = True

    # 새 주문들 한번에 flush (최적화!)
    if new_orders:
        db.flush()

    # OrderItem 처리 - 새 주문만!
    for order_no, group in df_filtered.groupby('order_no'):
        # 기존 주문인지 체크
        if order_no in existing_orders:
            # 기존 주문은 건너뛰기!
            stats['skipped_items'] += len(group)
            continue
            
        # 새 주문의 order 객체 찾기
        order = next((o for o in new_orders if o.order_no == order_no), None)
        if not order:
            continue
            
        # 새 주문의 아이템들 처리
        for _, row in group.iterrows():
            product = all_products.get(row['product_code'])
            
            # 제품 있든 없든 무조건 생성!
            item = OrderItem(
                order_id=order.id,
                product_id=product.id if product else None,  # 제품 없으면 NULL
                product_code=row['product_code'],
                seller_id_snapshot=product.seller_id if product else None,  # 제품 없으면 NULL
                quantity=int(row['quantity']),
                supply_price=product.supply_price if product else Decimal('0'),  # 제품 없으면 0
                sale_price=product.sale_price if product else Decimal('0'),      # 제품 없으면 0
                cny_amount=Decimal(str(row['cny_amount'])) if pd.notna(row['cny_amount']) else None
            )
            new_items.append(item)
            
            if product:
                stats['new_items'] += 1
            else:
                if row['product_code'] not in stats['unmatched_products']:
                    stats['unmatched_products'].append(row['product_code'])

    # 한번에 저장 (최적화!)
    if new_items:
        db.bulk_save_objects(new_items)
    
    # 13. ImportBatch 기록
    import_batch = ImportBatch(
        source_name=file.filename,
        hash=file_hash,
        row_count_total=len(df),
        row_count_matched=stats['new_items'] + stats['skipped_items'],
        imported_by=current.id,
        imported_at=get_korea_time_naive()  # 추가
    )
    db.add(import_batch)
    
   # 13-1. 통계 업데이트 추가!
    if new_items:
        update_dashboard_summary(db, new_items)

     # 13-2. 제품 랭킹 업데이트 추가! (전체 재계산)
    update_product_rankings(db)  # seller_id 없이 호출 = 전체

    # 14. 커밋
    db.commit()
    
    # 15. 결과 반환
    return {
        "success": True,
        "message": "업로드 완료",
        "stats": stats
    }
# === Orders List API ===
@router.get("/orders")
def list_orders(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current: Account = Depends(get_current_account)
):
    orders = db.query(Order).offset(skip).limit(limit).all()
    
    result = []
    for order in orders:
        order_dict = {
            "id": order.id,
            "order_no": order.order_no,
            "buyer_id": order.buyer_id,
            "order_time": order.order_time,
            "status_raw": order.status,
            "status_display": ORDER_STATUS_MAP.get(order.status, order.status),
            "created_at": order.created_at
        }
        result.append(order_dict)
    
    return result

@router.get("/orders/{order_id}/items")
def get_order_items(
    order_id: int,
    db: Session = Depends(get_db),
    current: Account = Depends(get_current_account)
):
    items = db.query(OrderItem).filter(OrderItem.order_id == order_id).all()
    return items
# === Orders with Items API ===
@router.get("/orders/with-items")
def list_orders_with_items(
    skip: int = 0,
    limit: int = 20,
    seller_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current: Account = Depends(get_current_account)
):
    # 권한별 필터링
    if current.type == "seller":
        seller_id = current.seller_id
    
    # 기본 쿼리 - OrderItem 중심으로 변경
    query = db.query(OrderItem).join(Order, OrderItem.order_id == Order.id)
    
    # seller 필터링
    if seller_id:
        query = query.filter(OrderItem.seller_id_snapshot == seller_id)
    
    # 정렬 및 페이지네이션
    items = query.order_by(Order.order_time.desc()).offset(skip).limit(limit).all()
    
    # 각 OrderItem을 개별 행으로 변환
    result = []
    
    for item in items:
        order = db.query(Order).filter(Order.id == item.order_id).first()
        if not order:
            continue
        
        product = db.query(Product).filter(Product.id == item.product_id).first()
        product_name = product.name if product else "미확인제품"
        
        seller = db.query(Seller).filter(Seller.id == item.seller_id_snapshot).first()
        seller_name = seller.name if seller else "미확인"
        
        item_data = {
            "order_no": order.order_no,
            "buyer_id": order.buyer_id,
            "order_time": order.order_time,
            "status_raw": order.status,
            "status_display": ORDER_STATUS_MAP.get(order.status, order.status),
            "item_id": item.id,
            "product_id": item.product_id,
            "product_name": product_name,
            "product_code": item.product_code,
            "seller_name": seller_name,
            "quantity": item.quantity,
            "supply_price": float(item.supply_price),
            "sale_price": float(item.sale_price),
            "supply_total": float(item.supply_price * item.quantity),
            "sale_total": float(item.sale_price * item.quantity),
            "cny_amount": float(item.cny_amount) if item.cny_amount else None
        }
        
        result.append(item_data)
    
    # 전체 카운트
    total_count = query.count()
    
    return {
        "orders": result,
        "total": total_count,
        "page": skip // limit + 1,
        "pages": (total_count + limit - 1) // limit
    }

# === Order Item Price Update API ===
@router.put("/order-items/{item_id}/price")
def update_order_item_price(
    item_id: int,
    supply_price: float = Form(...),
    sale_price: float = Form(...),
    note: str = Form(None),  # ✅ note 파라미터 추가
    db: Session = Depends(get_db),
    current: Account = Depends(admin_only)
):
    item = db.query(OrderItem).filter(OrderItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="주문 아이템을 찾을 수 없습니다")
    
    # ✅ 변경 전 값 저장
    old_supply_price = item.supply_price
    old_sale_price = item.sale_price
    
    # ✅ 새 값으로 변환
    new_supply_price = Decimal(str(supply_price))
    new_sale_price = Decimal(str(sale_price))
    
    # ✅ 실제로 값이 변경된 경우만 처리
    if old_supply_price != new_supply_price or old_sale_price != new_sale_price:
        # Audit 로그 생성
        audit = OrderItemAudit(
            order_item_id=item_id,
            changed_by=current.id,
            changed_at=get_korea_time_naive(),
            from_supply_price=old_supply_price,
            to_supply_price=new_supply_price,
            from_sale_price=old_sale_price,
            to_sale_price=new_sale_price,
            note=note or "관리자 가격 수정"
        )
        db.add(audit)
        
        # order_item 업데이트
        item.supply_price = new_supply_price
        item.sale_price = new_sale_price
        item.last_modified_at = get_korea_time_naive()
        item.last_modified_by = current.id
    
    # 커밋
    db.commit()
    
    # 해당 입점사만 재계산
    seller_id = item.seller_id_snapshot if item.seller_id_snapshot else None
    
    # 대시보드 통계 재계산 (해당 입점사 + 전체)
    from crud import recalculate_dashboard_summary_full
    recalculate_dashboard_summary_full(db, seller_id)
    
    # 랭킹 재계산 (해당 입점사 + 전체)
    from crud import update_product_rankings
    update_product_rankings(db, seller_id)
    
    return {"success": True, "message": "가격이 수정되었습니다"}

# 🔴 파일 맨 끝에 추가
# === Order Item Audit History API ===
@router.get("/order-items/{item_id}/audit-history")
def get_order_item_audit_history(
    item_id: int,
    db: Session = Depends(get_db),
    current: Account = Depends(get_current_account)
):
    """주문 아이템의 가격 변경 이력 조회"""
    
    # 주문 아이템 확인
    item = db.query(OrderItem).filter(OrderItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="주문 아이템을 찾을 수 없습니다")
    
    # 권한 체크 (관리자 또는 해당 입점사)
    if current.type == "seller" and item.seller_id_snapshot != current.seller_id:
        raise HTTPException(status_code=403, detail="권한이 없습니다")
    
    # Audit 이력 조회 (변경자 이름 포함)
    audits = db.query(
        OrderItemAudit,
        Account.username.label("changed_by_username")
    ).join(
        Account, OrderItemAudit.changed_by == Account.id
    ).filter(
        OrderItemAudit.order_item_id == item_id
    ).order_by(
        OrderItemAudit.changed_at.desc()
    ).all()
    
    # 결과 포맷팅
    result = []
    for audit, username in audits:
        result.append({
            "id": audit.id,
            "changed_at": audit.changed_at.isoformat(),
            "changed_by": username,
            "from_supply_price": float(audit.from_supply_price) if audit.from_supply_price else None,
            "to_supply_price": float(audit.to_supply_price) if audit.to_supply_price else None,
            "from_sale_price": float(audit.from_sale_price) if audit.from_sale_price else None,
            "to_sale_price": float(audit.to_sale_price) if audit.to_sale_price else None,
            "note": audit.note
        })
    
    return result