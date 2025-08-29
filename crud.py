import os
import pytz
from datetime import datetime, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from models import (
    DashboardSummary, Order, OrderItem, 
    Product, Seller, ProductRankings
)

# ===== 한국시간 헬퍼 함수 =====
def get_korea_time():
    """한국시간 반환 (타임존 포함)"""
    KST = pytz.timezone('Asia/Seoul')
    return datetime.now(KST)

def get_korea_time_naive():
    """한국시간 반환 (타임존 제거 - DB 저장용)"""
    from datetime import datetime, timedelta
    # Railway DB는 UTC이므로 우리가 +9시간 계산#
    return datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=9)

def get_china_time_naive():
    """중국시간 반환 (타임존 제거 - DB 저장용)"""
    # 중국은 UTC+8
    return datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=8)

# === 주문 상태 매핑 ===
ORDER_STATUS_MAP = {
    '待发货': '발송대기',
    '待收货': '배송중',
    '已报关': '통관중',
    '已完成': '배송완료',
    '已取消': '주문취소',
    '退款/售后': '환불/교환'
}

ORDER_STATUS_REVERSE_MAP = {v: k for k, v in ORDER_STATUS_MAP.items()}

# 통계용 상수
TOTAL_STATS_SELLER_ID = 0
VALID_STATUS_FOR_STATS = ['待发货', '待收货', '已报关', '已完成']
DEDUCT_STOCK_STATUSES = ['待发货', '待收货', '已报关', '已完成', '退款/售后']

# 업로드 디렉토리 설정
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
# === 기본 엔드포인트 ===


# === 통계 관련 헬퍼 함수 ===
from datetime import datetime, timedelta

def get_week_start(date):
    """주어진 날짜의 해당 주 월요일 반환"""
    return date - timedelta(days=date.weekday())

def get_month_start(date):
    """주어진 날짜의 해당 월 1일 반환"""
    return date.replace(day=1)

def reset_period_if_needed(db: Session, current_date: datetime):
    """기간이 변경되었으면 해당 통계 리셋"""
    # 모든 seller의 마지막 업데이트 시간 확인
    summaries = db.query(DashboardSummary).all()
    
    for summary in summaries:
        if not summary.last_updated:
            continue
            
        last_date = summary.last_updated.date()
        current = get_korea_time_naive().date()
        
        # 월이 바뀌었으면
        if last_date.month != current.month or last_date.year != current.year:
            summary.month_supply_amount = 0
            summary.month_sale_amount = 0
            summary.month_quantity = 0
        
        # 주가 바뀌었으면
        if get_week_start(last_date) != get_week_start(current):
            summary.week_supply_amount = 0
            summary.week_sale_amount = 0
            summary.week_quantity = 0
        
        # 날이 바뀌었으면 (어제 데이터 리셋)
        if last_date != current:
            summary.yesterday_supply_amount = 0
            summary.yesterday_sale_amount = 0
            summary.yesterday_quantity = 0

def recalculate_stats_for_status_change(db: Session, order_id: int, old_status: str, new_status: str):
    """주문 상태 변경시 통계 재계산"""
    # 유효한 상태 목록
    valid_for_stats = VALID_STATUS_FOR_STATS  # ['待发货', '待收货', '已报关', '已完成']
    invalid_for_stats = ['已取消', '退款/售后']
    
    # 이전 상태와 새 상태가 같으면 리턴
    if old_status == new_status:
        return
    
    # 해당 주문의 모든 아이템 가져오기
    order_items = db.query(OrderItem).filter(OrderItem.order_id == order_id).all()
    if not order_items:
        return
    
    # 각 아이템의 입점사별로 통계 계산
    for item in order_items:
        seller_id = item.seller_id_snapshot if item.seller_id_snapshot else TOTAL_STATS_SELLER_ID
        
        # 통계 가져오기
        summary = db.query(DashboardSummary).filter(
            DashboardSummary.seller_id == seller_id
        ).first()
        
        if not summary:
            summary = DashboardSummary(
                seller_id=seller_id,
                # 모든 필드를 0으로 초기화
                total_supply_amount=Decimal('0'),
                total_sale_amount=Decimal('0'),
                total_quantity=0,
                month_supply_amount=Decimal('0'),
                month_sale_amount=Decimal('0'),
                month_quantity=0,
                week_supply_amount=Decimal('0'),
                week_sale_amount=Decimal('0'),
                week_quantity=0,
                yesterday_supply_amount=Decimal('0'),
                yesterday_sale_amount=Decimal('0'),
                yesterday_quantity=0,
                last_updated=datetime.now()
            )
            db.add(summary)
        
        # 금액 계산
        supply_amount = Decimal(str(item.supply_price * item.quantity))
        sale_amount = Decimal(str(item.sale_price * item.quantity))
        quantity = item.quantity
        
        # 상태 변경에 따른 처리
        # Case 1: 정상 → 취소/환불 (통계에서 빼기)
        if old_status in valid_for_stats and new_status in invalid_for_stats:
            summary.total_supply_amount -= supply_amount
            summary.total_sale_amount -= sale_amount
            summary.total_quantity -= quantity
            
            # 주문 날짜 확인하여 기간별 통계도 차감
            order = db.query(Order).filter(Order.id == order_id).first()
            if order:
                order_date = order.order_time.date()
                current_date = datetime.now()
                
                # 이번달 통계
                if order_date.month == current_date.month and order_date.year == current_date.year:
                    summary.month_supply_amount -= supply_amount
                    summary.month_sale_amount -= sale_amount
                    summary.month_quantity -= quantity
                
                # 이번주 통계
                if order_date >= get_week_start(current_date.date()):
                    summary.week_supply_amount -= supply_amount
                    summary.week_sale_amount -= sale_amount
                    summary.week_quantity -= quantity
                
                # 어제 통계
                yesterday = (current_date - timedelta(days=1)).date()
                if order_date == yesterday:
                    summary.yesterday_supply_amount -= supply_amount
                    summary.yesterday_sale_amount -= sale_amount
                    summary.yesterday_quantity -= quantity
        
        # Case 2: 취소/환불 → 정상 (통계에 더하기)
        elif old_status in invalid_for_stats and new_status in valid_for_stats:
            summary.total_supply_amount += supply_amount
            summary.total_sale_amount += sale_amount
            summary.total_quantity += quantity
            
            # 주문 날짜 확인하여 기간별 통계도 가산
            order = db.query(Order).filter(Order.id == order_id).first()
            if order:
                order_date = order.order_time.date()
                current_date = datetime.now()
                
                # 이번달 통계
                if order_date.month == current_date.month and order_date.year == current_date.year:
                    summary.month_supply_amount += supply_amount
                    summary.month_sale_amount += sale_amount
                    summary.month_quantity += quantity
                
                # 이번주 통계
                if order_date >= get_week_start(current_date.date()):
                    summary.week_supply_amount += supply_amount
                    summary.week_sale_amount += sale_amount
                    summary.week_quantity += quantity
                
                # 어제 통계
                yesterday = (current_date - timedelta(days=1)).date()
                if order_date == yesterday:
                    summary.yesterday_supply_amount += supply_amount
                    summary.yesterday_sale_amount += sale_amount
                    summary.yesterday_quantity += quantity
    
    # 전체 통계도 업데이트
    recalculate_total_stats(db)

def recalculate_total_stats(db: Session):
    """전체 통계 재계산 (0)"""
    total_summary = db.query(DashboardSummary).filter(
        DashboardSummary.seller_id == TOTAL_STATS_SELLER_ID
    ).first()
    
    if not total_summary:
        total_summary = DashboardSummary(
            seller_id=TOTAL_STATS_SELLER_ID,
            total_supply_amount=Decimal('0'),
            total_sale_amount=Decimal('0'),
            total_quantity=0,
            month_supply_amount=Decimal('0'),
            month_sale_amount=Decimal('0'),
            month_quantity=0,
            week_supply_amount=Decimal('0'),
            week_sale_amount=Decimal('0'),
            week_quantity=0,
            yesterday_supply_amount=Decimal('0'),
            yesterday_sale_amount=Decimal('0'),
            yesterday_quantity=0,
            last_updated=datetime.now()
        )
        db.add(total_summary)
    
    # 모든 입점사 통계 합산 (0 제외)
    all_summaries = db.query(DashboardSummary).filter(
        DashboardSummary.seller_id != TOTAL_STATS_SELLER_ID
    ).all()
    
    # 초기화
    total_summary.total_supply_amount = 0
    total_summary.total_sale_amount = 0
    total_summary.total_quantity = 0
    total_summary.month_supply_amount = 0
    total_summary.month_sale_amount = 0
    total_summary.month_quantity = 0
    total_summary.week_supply_amount = 0
    total_summary.week_sale_amount = 0
    total_summary.week_quantity = 0
    total_summary.yesterday_supply_amount = 0
    total_summary.yesterday_sale_amount = 0
    total_summary.yesterday_quantity = 0
    
    # 합산
    for s in all_summaries:
        total_summary.total_supply_amount += s.total_supply_amount
        total_summary.total_sale_amount += s.total_sale_amount
        total_summary.total_quantity += s.total_quantity
        total_summary.month_supply_amount += s.month_supply_amount
        total_summary.month_sale_amount += s.month_sale_amount
        total_summary.month_quantity += s.month_quantity
        total_summary.week_supply_amount += s.week_supply_amount
        total_summary.week_sale_amount += s.week_sale_amount
        total_summary.week_quantity += s.week_quantity
        total_summary.yesterday_supply_amount += s.yesterday_supply_amount
        total_summary.yesterday_sale_amount += s.yesterday_sale_amount
        total_summary.yesterday_quantity += s.yesterday_quantity
    
    total_summary.last_updated = get_korea_time_naive()

def recalculate_dashboard_summary_full(db: Session, seller_id: int = None):
    """
    DashboardSummary를 완전히 재계산
    seller_id가 있으면 해당 입점사만, None이면 모든 입점사
    """
    current_date = get_korea_time_naive()
    yesterday = (current_date - timedelta(days=1)).date()
    week_start = get_week_start(current_date.date())
    month_start = current_date.replace(day=1, hour=0, minute=0, second=0)
    
    # 재계산할 seller 목록
    if seller_id:
        seller_ids = [seller_id, TOTAL_STATS_SELLER_ID]  # 해당 입점사 + 전체
    else:
        seller_ids = [s.id for s in db.query(Seller).all()]
        seller_ids.append(TOTAL_STATS_SELLER_ID)
    
    for sid in seller_ids:
        # 기존 summary 가져오거나 생성
        summary = db.query(DashboardSummary).filter(
            DashboardSummary.seller_id == sid
        ).first()
        
        if not summary:
            summary = DashboardSummary(
                seller_id=sid,
                total_supply_amount=Decimal('0'),
                total_sale_amount=Decimal('0'),
                total_quantity=0,
                month_supply_amount=Decimal('0'),
                month_sale_amount=Decimal('0'),
                month_quantity=0,
                week_supply_amount=Decimal('0'),
                week_sale_amount=Decimal('0'),
                week_quantity=0,
                yesterday_supply_amount=Decimal('0'),
                yesterday_sale_amount=Decimal('0'),
                yesterday_quantity=0,
                last_updated=current_date
            )
            db.add(summary)
        
        # 모든 값 초기화
        summary.total_supply_amount = Decimal('0')
        summary.total_sale_amount = Decimal('0')
        summary.total_quantity = 0
        summary.month_supply_amount = Decimal('0')
        summary.month_sale_amount = Decimal('0')
        summary.month_quantity = 0
        summary.week_supply_amount = Decimal('0')
        summary.week_sale_amount = Decimal('0')
        summary.week_quantity = 0
        summary.yesterday_supply_amount = Decimal('0')
        summary.yesterday_sale_amount = Decimal('0')
        summary.yesterday_quantity = 0
        
        # 조건에 맞는 OrderItem 조회
        if sid == TOTAL_STATS_SELLER_ID:
            # 전체 통계
            query = db.query(OrderItem).join(Order)
        else:
            # 특정 입점사
            query = db.query(OrderItem).join(Order).filter(
                OrderItem.seller_id_snapshot == sid
            )
        
        # 유효한 상태만 필터링
        query = query.filter(Order.status.in_(VALID_STATUS_FOR_STATS))
        items = query.all()
        
        # 각 아이템 집계
        for item in items:
            order = db.query(Order).filter(Order.id == item.order_id).first()
            if not order:
                continue
            
            order_date = order.order_time.date()
            supply_amount = Decimal(str(item.supply_price * item.quantity))
            sale_amount = Decimal(str(item.sale_price * item.quantity))
            quantity = item.quantity
            
            # 누적
            summary.total_supply_amount += supply_amount
            summary.total_sale_amount += sale_amount
            summary.total_quantity += quantity
            
            # 이번달
            if order_date >= month_start.date():
                summary.month_supply_amount += supply_amount
                summary.month_sale_amount += sale_amount
                summary.month_quantity += quantity
            
            # 이번주
            if order_date >= week_start:
                summary.week_supply_amount += supply_amount
                summary.week_sale_amount += sale_amount
                summary.week_quantity += quantity
            
            # 어제
            if order_date == yesterday:
                summary.yesterday_supply_amount += supply_amount
                summary.yesterday_sale_amount += sale_amount
                summary.yesterday_quantity += quantity
        
        summary.last_updated = current_date
    
    db.commit()

def update_dashboard_summary(db: Session, order_items: list):
    """대시보드 요약 통계 업데이트"""
    current_date = datetime.now()
    yesterday = (current_date - timedelta(days=1)).date()
    
    # 기간 리셋 체크
    reset_period_if_needed(db, current_date)
    
    # seller별로 그룹핑
    seller_stats = {}
    
    for item in order_items:
        # 주문 날짜 확인
        order = db.query(Order).filter(Order.id == item.order_id).first()
        if not order or order.status not in VALID_STATUS_FOR_STATS:
            continue
            
        order_date = order.order_time.date()
        
        # seller_id 결정
        seller_id = item.seller_id_snapshot if item.seller_id_snapshot else TOTAL_STATS_SELLER_ID
        
        if seller_id not in seller_stats:
            seller_stats[seller_id] = {
                'total': {'supply': 0, 'sale': 0, 'qty': 0},
                'month': {'supply': 0, 'sale': 0, 'qty': 0},
                'week': {'supply': 0, 'sale': 0, 'qty': 0},
                'yesterday': {'supply': 0, 'sale': 0, 'qty': 0}
            }
        
        # 금액 계산
        supply_amount = float(item.supply_price * item.quantity)
        sale_amount = float(item.sale_price * item.quantity)
        quantity = item.quantity
        
        # 누적
        seller_stats[seller_id]['total']['supply'] += supply_amount
        seller_stats[seller_id]['total']['sale'] += sale_amount
        seller_stats[seller_id]['total']['qty'] += quantity
        
        # 이번달
        if order_date.month == current_date.month and order_date.year == current_date.year:
            seller_stats[seller_id]['month']['supply'] += supply_amount
            seller_stats[seller_id]['month']['sale'] += sale_amount
            seller_stats[seller_id]['month']['qty'] += quantity
        
        # 이번주
        if order_date >= get_week_start(current_date.date()):
            seller_stats[seller_id]['week']['supply'] += supply_amount
            seller_stats[seller_id]['week']['sale'] += sale_amount
            seller_stats[seller_id]['week']['qty'] += quantity
        
        # 전일
        if order_date == yesterday:
            seller_stats[seller_id]['yesterday']['supply'] += supply_amount
            seller_stats[seller_id]['yesterday']['sale'] += sale_amount
            seller_stats[seller_id]['yesterday']['qty'] += quantity
    
    # 전체 통계도 추가
    total_stats = {
        'total': {'supply': 0, 'sale': 0, 'qty': 0},
        'month': {'supply': 0, 'sale': 0, 'qty': 0},
        'week': {'supply': 0, 'sale': 0, 'qty': 0},
        'yesterday': {'supply': 0, 'sale': 0, 'qty': 0}
    }
    
    # 전체 합산
    for seller_id, stats in seller_stats.items():
        if seller_id != TOTAL_STATS_SELLER_ID:
            for period in ['total', 'month', 'week', 'yesterday']:
                total_stats[period]['supply'] += stats[period]['supply']
                total_stats[period]['sale'] += stats[period]['sale']
                total_stats[period]['qty'] += stats[period]['qty']
    
    seller_stats[TOTAL_STATS_SELLER_ID] = total_stats
    
    # DB 업데이트
    for seller_id, stats in seller_stats.items():
        summary = db.query(DashboardSummary).filter(
            DashboardSummary.seller_id == seller_id
        ).first()
        
        if not summary:
            summary = DashboardSummary(
                seller_id=seller_id,
                # 모든 필드를 0으로 초기화
                total_supply_amount=Decimal('0'),
                total_sale_amount=Decimal('0'),
                total_quantity=0,
                month_supply_amount=Decimal('0'),
                month_sale_amount=Decimal('0'),
                month_quantity=0,
                week_supply_amount=Decimal('0'),
                week_sale_amount=Decimal('0'),
                week_quantity=0,
                yesterday_supply_amount=Decimal('0'),
                yesterday_sale_amount=Decimal('0'),
                yesterday_quantity=0,
                last_updated=get_korea_time_naive()
            )
            db.add(summary)
        
        # 값 업데이트
        summary.total_supply_amount += Decimal(str(stats['total']['supply']))
        summary.total_sale_amount += Decimal(str(stats['total']['sale']))
        summary.total_quantity += stats['total']['qty']
        
        summary.month_supply_amount += Decimal(str(stats['month']['supply']))
        summary.month_sale_amount += Decimal(str(stats['month']['sale']))
        summary.month_quantity += stats['month']['qty']
        
        summary.week_supply_amount += Decimal(str(stats['week']['supply']))
        summary.week_sale_amount += Decimal(str(stats['week']['sale']))
        summary.week_quantity += stats['week']['qty']
        
        summary.yesterday_supply_amount += Decimal(str(stats['yesterday']['supply']))
        summary.yesterday_sale_amount += Decimal(str(stats['yesterday']['sale']))
        summary.yesterday_quantity += stats['yesterday']['qty']
        
        summary.last_updated = get_korea_time_naive()  
        
def update_product_rankings(db: Session, seller_id: int = None):
    """제품 TOP5 랭킹 업데이트"""
    from sqlalchemy import desc
    

   # 선택적 랭킹 삭제
    if seller_id:
        # 특정 입점사와 전체만 삭제
        db.query(ProductRankings).filter(
            ProductRankings.seller_id.in_([seller_id, TOTAL_STATS_SELLER_ID])
        ).delete()
        update_sellers = [seller_id]  # 업데이트할 입점사 목록
    else:
        # 전체 삭제 (주문서 업로드 시)
        db.query(ProductRankings).delete()
        update_sellers = [s.id for s in db.query(Seller).all()]
    
    # 기간 타입들
    period_types = ['cumulative', 'year', 'month', 'week']
    rank_types = ['revenue', 'quantity']
    
    current_date = datetime.utcnow()
    
    for period_type in period_types:
        for rank_type in rank_types:
            # 기본 쿼리 - OrderItem과 Order를 먼저 조인
            base_query = db.query(
                OrderItem.product_id,
                func.sum(OrderItem.quantity * OrderItem.sale_price).label('amount'),
                func.sum(OrderItem.quantity).label('quantity')
            ).select_from(
                OrderItem
            ).join(
                Order, OrderItem.order_id == Order.id
            ).filter(
                Order.status.in_(VALID_STATUS_FOR_STATS),
                OrderItem.product_id.isnot(None)
            )
            
            # 기간별 필터 추가
            if period_type == 'year':
                start_date = current_date.replace(month=1, day=1, hour=0, minute=0, second=0)
                base_query = base_query.filter(Order.order_time >= start_date)
            elif period_type == 'month':
                start_date = current_date.replace(day=1, hour=0, minute=0, second=0)
                base_query = base_query.filter(Order.order_time >= start_date)
            elif period_type == 'week':
                start_date = get_week_start(current_date.date())
                base_query = base_query.filter(Order.order_time >= start_date)
            
            # GROUP BY와 ORDER BY
            if rank_type == 'revenue':
                results = base_query.group_by(
                    OrderItem.product_id
                ).order_by(
                    desc('amount')
                ).limit(5).all()
            else:
                results = base_query.group_by(
                    OrderItem.product_id
                ).order_by(
                    desc('quantity')
                ).limit(5).all()
            
            # 전체 TOP5 저장
            for idx, row in enumerate(results, 1):
                product = db.query(Product).filter(Product.id == row.product_id).first()
                if not product:
                    continue
                
                seller = db.query(Seller).filter(Seller.id == product.seller_id).first()
                
                ranking = ProductRankings(
                    scope_type='all',
                    seller_id=TOTAL_STATS_SELLER_ID,
                    period_type=period_type,
                    rank_type=rank_type,
                    rank=idx,
                    product_id=row.product_id,
                    product_name=product.name,
                    seller_name=seller.name if seller else None,
                    amount=float(row.amount) if row.amount else 0,
                    quantity=int(row.quantity) if row.quantity else 0,
                    last_updated=current_date
                )
                db.add(ranking)
                
                # 디버깅
                print(f"✅ {period_type}/{rank_type} TOP{idx}: {product.name} - 수량: {row.quantity}개, 금액: ${row.amount}")
            
          # 각 입점사별 TOP5 (공급가 기준)
            if seller_id:
                # 특정 입점사만
                sellers_to_update = db.query(Seller).filter(Seller.id == seller_id).all()
            else:
                # 전체 입점사
                sellers_to_update = db.query(Seller).filter(Seller.id != TOTAL_STATS_SELLER_ID).all()
            
            for seller in sellers_to_update:
                seller_query = db.query(
                    OrderItem.product_id,
                    func.sum(OrderItem.quantity * OrderItem.supply_price).label('amount'),  # 공급가 기준
                    func.sum(OrderItem.quantity).label('quantity')
                ).select_from(
                    OrderItem
                ).join(
                    Order, OrderItem.order_id == Order.id
                ).join(
                    Product, OrderItem.product_id == Product.id
                ).filter(
                    Order.status.in_(VALID_STATUS_FOR_STATS),
                    Product.seller_id == seller.id
                )
                
                # 기간별 필터
                if period_type == 'year':
                    start_date = current_date.replace(month=1, day=1, hour=0, minute=0, second=0)
                    seller_query = seller_query.filter(Order.order_time >= start_date)
                elif period_type == 'month':
                    start_date = current_date.replace(day=1, hour=0, minute=0, second=0)
                    seller_query = seller_query.filter(Order.order_time >= start_date)
                elif period_type == 'week':
                    start_date = get_week_start(current_date.date())
                    seller_query = seller_query.filter(Order.order_time >= start_date)
                
                # ORDER BY
                if rank_type == 'revenue':
                    seller_results = seller_query.group_by(
                        OrderItem.product_id
                    ).order_by(
                        desc('amount')
                    ).limit(5).all()
                else:
                    seller_results = seller_query.group_by(
                        OrderItem.product_id
                    ).order_by(
                        desc('quantity')
                    ).limit(5).all()
                
                # 입점사별 랭킹 저장
                for idx, row in enumerate(seller_results, 1):
                    product = db.query(Product).filter(Product.id == row.product_id).first()
                    if not product:
                        continue
                    
                    ranking = ProductRankings(
                        scope_type='seller',
                        seller_id=seller.id,
                        period_type=period_type,
                        rank_type=rank_type,
                        rank=idx,
                        product_id=row.product_id,
                        product_name=product.name,
                        seller_name=None,
                        amount=float(row.amount) if row.amount else 0,
                        quantity=int(row.quantity) if row.quantity else 0,
                        last_updated=current_date
                    )
                    db.add(ranking)
    
        db.commit()
        
        if seller_id:
            print(f"✅ 선택적 랭킹 업데이트 완료: 입점사 {seller_id} + 전체(0)")
        else:
            print(f"✅ 전체 랭킹 업데이트 완료: {len(update_sellers)}개 입점사")

    # crud.py에 추가
def find_product_and_multiplier(db: Session, product_code: str):
    """제품코드로 실제 제품과 수량 배수 찾기"""
    from models import Product, ProductCodeMapping
    
    # 1. 메인 제품코드 확인
    product = db.query(Product).filter(Product.product_code == product_code).first()
    if product:
        return product, 1
    
    # 2. 매핑된 코드 확인
    mapping = db.query(ProductCodeMapping).filter(
        ProductCodeMapping.mapped_code == product_code
    ).first()
    
    if mapping:
        product = db.query(Product).filter(Product.id == mapping.product_id).first()
        return product, mapping.quantity_multiplier
    
    return None, 1


# ===== 선적 관리 FIFO 함수 =====
def get_shipment_price_at_date(db: Session, shipment_id: int, order_date):
    """특정 날짜의 선적 가격 조회"""
    from models import ShipmentPriceHistory, ProductShipment
    
    if hasattr(order_date, 'date'):
        order_date = order_date.date()
    
    # 해당 날짜에 유효한 가격 찾기
    price = db.query(ShipmentPriceHistory).filter(
        ShipmentPriceHistory.shipment_id == shipment_id,
        ShipmentPriceHistory.effective_date <= order_date
    ).order_by(ShipmentPriceHistory.effective_date.desc()).first()
    
    if price:
        return price.supply_price, price.sale_price
    
    # 이력이 없으면 선적의 현재 가격
    shipment = db.query(ProductShipment).filter(ProductShipment.id == shipment_id).first()
    if shipment:
        return shipment.supply_price, shipment.sale_price
    
    return Decimal('0'), Decimal('0')

def get_current_product_price(db: Session, product_id: int):
    """제품의 현재 판매 가격 (가장 오래된 활성 선적)"""
    from models import ProductShipment
    
    shipment = db.query(ProductShipment).filter(
        ProductShipment.product_id == product_id,
        ProductShipment.remaining_quantity > 0,
        ProductShipment.is_active == 1
    ).order_by(ProductShipment.arrival_date.asc()).first()
    
    if shipment:
        return shipment.supply_price, shipment.sale_price
    return Decimal('0'), Decimal('0')

def get_product_total_stock(db: Session, product_id: int):
    """제품의 총 재고 수량"""
    from models import ProductShipment
    
    total = db.query(func.sum(ProductShipment.remaining_quantity)).filter(
        ProductShipment.product_id == product_id,
        ProductShipment.is_active == 1
    ).scalar()
    
    return total or 0

def process_order_fifo(db: Session, product_id: int, quantity_needed: int, order_date):
    """FIFO 방식으로 주문 처리 및 가격 계산"""
    from models import ProductShipment
    
    if hasattr(order_date, 'date'):
        order_date = order_date.date()
    
    # 활성 선적을 날짜순으로 조회
    shipments = db.query(ProductShipment).filter(
        ProductShipment.product_id == product_id,
        ProductShipment.remaining_quantity > 0,
        ProductShipment.is_active == 1
    ).order_by(ProductShipment.arrival_date.asc()).all()
    
    total_supply_price = Decimal('0')
    total_sale_price = Decimal('0')
    shipments_used = []
    
    for shipment in shipments:
        if quantity_needed <= 0:
            break
        
        # 이 선적에서 사용할 수량
        use_qty = min(quantity_needed, shipment.remaining_quantity)
        
        # 해당 날짜의 선적 가격 조회
        supply_price, sale_price = get_shipment_price_at_date(
            db, shipment.id, order_date
        )
        
        # 가격 계산
        total_supply_price += supply_price * use_qty
        total_sale_price += sale_price * use_qty
        
        # 사용 내역 기록
        shipments_used.append({
            'shipment_id': shipment.id,
            'quantity': use_qty,
            'supply_price': supply_price,
            'sale_price': sale_price
        })
        
        # 재고 차감 (실제로는 주문 확정시에만)
        quantity_needed -= use_qty
    
    # 평균 가격 계산
    if shipments_used:
        total_qty = sum(s['quantity'] for s in shipments_used)
        avg_supply_price = total_supply_price / total_qty
        avg_sale_price = total_sale_price / total_qty
    else:
        avg_supply_price = Decimal('0')
        avg_sale_price = Decimal('0')
    
    return {
        'supply_price': avg_supply_price,
        'sale_price': avg_sale_price,
        'shipments_used': shipments_used,
        'total_supply_amount': total_supply_price,
        'total_sale_amount': total_sale_price
    }