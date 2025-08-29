from typing import Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from models import DashboardSummary, ProductRankings, Order, OrderItem, Account  # Account 추가!
from db import get_db
from auth import get_current_account
from crud import TOTAL_STATS_SELLER_ID, VALID_STATUS_FOR_STATS, get_korea_time_naive
from models import Order, OrderItem, Product  # Product 추가 필요
from fastapi import Query
from fastapi import APIRouter, Depends, Query, Body  # Body 추가
from auth import get_current_account, admin_only  # admin_only 추가

router = APIRouter()


# === 대시보드 API ===
@router.get("/api/dashboard-summary")
def get_dashboard_summary(
    seller_id: Optional[int] = Query(None), 
    current: Account = Depends(get_current_account),
    db: Session = Depends(get_db)
):
    
    #

    """대시보드 상단 요약 데이터"""
    # 관리자가 특정 입점사 조회
    if current.type == 'admin' and seller_id:
        target_seller_id = seller_id
    elif current.type == 'seller':
        target_seller_id = current.seller_id
    else:
        target_seller_id = TOTAL_STATS_SELLER_ID  # 전체
    
    # 데이터 조회
    summary = db.query(DashboardSummary).filter(
        DashboardSummary.seller_id == target_seller_id
    ).first()
    
    if not summary:
        # 데이터 없으면 빈 값 반환
        return {
            "user_type": current.type,
            "cumulative": {"supply": 0, "sale": 0, "quantity": 0},
            "month": {"supply": 0, "sale": 0, "quantity": 0},
            "week": {"supply": 0, "sale": 0, "quantity": 0},
            "yesterday": {"supply": 0, "sale": 0, "quantity": 0}
        }
    
    # 권한별 응답 포맷
    if current.type == 'admin':
        return {
            "user_type": "admin",
            "cumulative": {
                "supply": float(summary.total_supply_amount),
                "sale": float(summary.total_sale_amount),
                "quantity": summary.total_quantity
            },
            "month": {
                "supply": float(summary.month_supply_amount),
                "sale": float(summary.month_sale_amount),
                "quantity": summary.month_quantity
            },
            "week": {
                "supply": float(summary.week_supply_amount),
                "sale": float(summary.week_sale_amount),
                "quantity": summary.week_quantity
            },
            "yesterday": {
                "supply": float(summary.yesterday_supply_amount),
                "sale": float(summary.yesterday_sale_amount),
                "quantity": summary.yesterday_quantity
            }
        }
    else:
        # 입점사는 공급가만
        return {
            "user_type": "seller",
            "cumulative": {
                "revenue": float(summary.total_supply_amount),
                "quantity": summary.total_quantity
            },
            "month": {
                "revenue": float(summary.month_supply_amount),
                "quantity": summary.month_quantity
            },
            "week": {
                "revenue": float(summary.week_supply_amount),
                "quantity": summary.week_quantity
            },
            "yesterday": {
                "revenue": float(summary.yesterday_supply_amount),
                "quantity": summary.yesterday_quantity
            }
        }

@router.get("/api/rankings")
def get_rankings(
    seller_id: Optional[int] = Query(None),
    current: Account = Depends(get_current_account),
    db: Session = Depends(get_db)
):
    """TOP5 랭킹 데이터"""
    rankings = {}
    
     # 관리자가 특정 입점사를 조회하는 경우
    if current.type == 'admin' and seller_id:
        for period in ['cumulative', 'year', 'month', 'week']:
            for rank_type in ['revenue', 'quantity']:
                key = f"{period}_{rank_type}"
                rankings[key] = db.query(ProductRankings).filter(
                    ProductRankings.scope_type == 'seller',
                    ProductRankings.seller_id == seller_id,  # 특정 입점사
                    ProductRankings.period_type == period,
                    ProductRankings.rank_type == rank_type
                ).order_by(ProductRankings.rank).limit(5).all()
    
    # 관리자가 전체를 보는 경우 (메인 대시보드)
    elif current.type == 'admin':
        for period in ['cumulative', 'year', 'month', 'week']:
            for rank_type in ['revenue', 'quantity']:
                key = f"{period}_{rank_type}"
                rankings[key] = db.query(ProductRankings).filter(
                    ProductRankings.scope_type == 'all',
                    ProductRankings.seller_id == TOTAL_STATS_SELLER_ID,
                    ProductRankings.period_type == period,
                    ProductRankings.rank_type == rank_type
                ).order_by(ProductRankings.rank).limit(5).all()
    
    # 입점사 계정인 경우
    else:
        for period in ['cumulative', 'year', 'month', 'week']:
            for rank_type in ['revenue', 'quantity']:
                key = f"{period}_{rank_type}"
                rankings[key] = db.query(ProductRankings).filter(
                    ProductRankings.scope_type == 'seller',
                    ProductRankings.seller_id == current.seller_id,
                    ProductRankings.period_type == period,
                    ProductRankings.rank_type == rank_type
                ).order_by(ProductRankings.rank).limit(5).all()
    # JSON 변환
    result = {}
    for key, items in rankings.items():
        result[key] = [{
            "rank": item.rank,
            "product_name": item.product_name,
            "seller_name": item.seller_name,
            "amount": float(item.amount),
            "quantity": item.quantity
        } for item in items]
    
    return result

@router.get("/api/chart/monthly")
def get_monthly_chart(
    product_ids: Optional[str] = Query(None),
    seller_id: Optional[int] = Query(None),  
    current: Account = Depends(get_current_account),
    db: Session = Depends(get_db)
):
    """월별 차트 데이터 (실시간 계산)"""
    # 기본 쿼리
    query = db.query(
        func.date_format(Order.order_time, '%Y-%m').label('month'),
        func.sum(OrderItem.quantity).label('qty'),
        func.sum(OrderItem.quantity * OrderItem.supply_price).label('supply'),
        func.sum(OrderItem.quantity * OrderItem.sale_price).label('sale')
    ).join(
        Order, OrderItem.order_id == Order.id
    ).filter(
        Order.status.in_(VALID_STATUS_FOR_STATS)
    )
    
    # 🔴 중복 제거하고 하나로 통합
    if current.type == 'admin' and seller_id:
        query = query.filter(OrderItem.seller_id_snapshot == seller_id)
    elif current.type == 'seller':
        query = query.filter(OrderItem.seller_id_snapshot == current.seller_id)
    
    # 제품 필터
    if product_ids:
        ids = [int(id) for id in product_ids.split(',')]
        query = query.filter(OrderItem.product_id.in_(ids))
    
    # 그룹핑 및 정렬
    result = query.group_by(
        func.date_format(Order.order_time, '%Y-%m')
    ).order_by('month').all()
    
    # 응답 포맷
    return [{
        "month": row.month,
        "quantity": row.qty,
        "amount": float(row.sale if current.type == 'admin' else row.supply),
        "supply_amount": float(row.supply)

    } for row in result]

@router.get("/api/chart/daily")
def get_daily_chart(
    product_ids: Optional[str] = Query(None),
    seller_id: Optional[int] = Query(None),
    current: Account = Depends(get_current_account),
    db: Session = Depends(get_db)
):
    """일별 차트 데이터 (최근 30일)"""
    thirty_days_ago = datetime.now() - timedelta(days=30)
    
    query = db.query(
        func.date(Order.order_time).label('date'),
        func.sum(OrderItem.quantity).label('qty'),
        func.sum(OrderItem.quantity * OrderItem.supply_price).label('supply'),
        func.sum(OrderItem.quantity * OrderItem.sale_price).label('sale')
    ).join(
        Order, OrderItem.order_id == Order.id
    ).filter(
        Order.status.in_(VALID_STATUS_FOR_STATS),
        Order.order_time >= thirty_days_ago
    )
    
    # 🔴 seller_id 처리 추가
    if current.type == 'admin' and seller_id:
        query = query.filter(OrderItem.seller_id_snapshot == seller_id)
    elif current.type == 'seller':
        query = query.filter(OrderItem.seller_id_snapshot == current.seller_id)
    
    # 제품 필터
    if product_ids:
        ids = [int(id) for id in product_ids.split(',')]
        query = query.filter(OrderItem.product_id.in_(ids))
    
    result = query.group_by(
        func.date(Order.order_time)
    ).order_by('date').all()
    
    return [{
        "date": row.date.isoformat(),
        "quantity": row.qty,
        "amount": float(row.sale if current.type == 'admin' else row.supply),
        "supply_amount": float(row.supply)  # ✅ 매출원가 추가
    } for row in result]

@router.get("/api/chart/range")
def get_range_chart(
    start_date: str,
    end_date: str,
    product_ids: Optional[str] = None,
    current: Account = Depends(get_current_account),
    db: Session = Depends(get_db)
):
    """특정 기간 차트 데이터"""
    from datetime import datetime
    
    # 날짜 파싱 - end_date는 23:59:59로 설정
    start = datetime.strptime(start_date, '%Y-%m-%d')
    end = datetime.strptime(end_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
    
    query = db.query(
        func.date(Order.order_time).label('date'),
        func.sum(OrderItem.quantity).label('qty'),
        func.sum(OrderItem.quantity * OrderItem.supply_price).label('supply'),
        func.sum(OrderItem.quantity * OrderItem.sale_price).label('sale')
    ).join(
        Order, OrderItem.order_id == Order.id
    ).filter(
        Order.status.in_(VALID_STATUS_FOR_STATS),
        Order.order_time >= start,
        Order.order_time <= end
    )
    
    # 권한별 필터
    if current.type == 'seller':
        query = query.filter(OrderItem.seller_id_snapshot == current.seller_id)
    
    # 제품 필터
    if product_ids:
        ids = [int(id) for id in product_ids.split(',')]
        query = query.filter(OrderItem.product_id.in_(ids))
    
    result = query.group_by(
        func.date(Order.order_time)
    ).order_by('date').all()
    
    # ✅ 다른 차트와 동일한 형식으로 수정
    return [{
        "date": row.date.isoformat(),
        "quantity": row.qty,
        "amount": float(row.sale if current.type == 'admin' else row.supply),  # 표시용
        "supply_amount": float(row.supply)  # 툴팁용 (매출원가)
    } for row in result]



@router.get("/api/last-month-stats")
def get_last_month_stats(
    seller_id: Optional[int] = Query(None),  # 🔴 seller_id 파라미터 추가
    current: Account = Depends(get_current_account),
    db: Session = Depends(get_db)
):
    """전월 통계 데이터"""
    from datetime import datetime
    from sqlalchemy import extract
    
    now = datetime.now()
    last_month = now.month - 1 if now.month > 1 else 12
    last_year = now.year if now.month > 1 else now.year - 1
    
    # 기본 쿼리
    base_query = db.query(
        OrderItem.product_id,
        Product.name.label('product_name'),
        func.sum(OrderItem.quantity).label('quantity'),
        func.sum(OrderItem.quantity * OrderItem.supply_price).label('supply_amount'),
        func.sum(OrderItem.quantity * OrderItem.sale_price).label('sale_amount')
    ).join(
        Order, OrderItem.order_id == Order.id
    ).join(
        Product, OrderItem.product_id == Product.id
    ).filter(
        extract('month', Order.order_time) == last_month,
        extract('year', Order.order_time) == last_year,
        Order.status.in_(VALID_STATUS_FOR_STATS)
    )
    
    # 🔴 seller_id 필터 추가
    if current.type == 'admin' and seller_id:
        # 관리자가 특정 입점사 조회
        base_query = base_query.filter(OrderItem.seller_id_snapshot == seller_id)
    elif current.type == 'seller':
        # 입점사 계정
        base_query = base_query.filter(OrderItem.seller_id_snapshot == current.seller_id)
    
    # TOP 10 제품
    top_products = base_query.group_by(
        OrderItem.product_id, Product.name
    ).order_by(
        func.sum(OrderItem.quantity * OrderItem.sale_price).desc()
    ).limit(10).all()
    
    # 전체 합계도 같은 필터 적용
    total_query = db.query(
        func.sum(OrderItem.quantity).label('total_quantity'),
        func.sum(OrderItem.quantity * OrderItem.supply_price).label('total_supply'),
        func.sum(OrderItem.quantity * OrderItem.sale_price).label('total_sale'),
        func.count(func.distinct(Order.id)).label('order_count')
    ).join(
        Order, OrderItem.order_id == Order.id
    ).filter(
        extract('month', Order.order_time) == last_month,
        extract('year', Order.order_time) == last_year,
        Order.status.in_(VALID_STATUS_FOR_STATS)
    )
    
    # 🔴 전체 합계에도 seller_id 필터 적용
    if current.type == 'admin' and seller_id:
        total_query = total_query.filter(OrderItem.seller_id_snapshot == seller_id)
    elif current.type == 'seller':
        total_query = total_query.filter(OrderItem.seller_id_snapshot == current.seller_id)
    
    totals = total_query.first()
    
    # NULL 체크
    total_supply = float(totals.total_supply or 0) if totals else 0
    total_sale = float(totals.total_sale or 0) if totals else 0
    total_quantity = (totals.total_quantity or 0) if totals else 0
    order_count = (totals.order_count or 0) if totals else 0
    
    # 제품 목록 처리
    product_list = []
    if top_products and len(top_products) > 0:
        for p in top_products:
            product_list.append({
                "product_name": p.product_name,
                "quantity": p.quantity or 0,
                "supply_amount": float(p.supply_amount or 0),
                "sale_amount": float(p.sale_amount or 0),
                "percentage": round((float(p.sale_amount or 0) / total_sale * 100), 1) if total_sale > 0 else 0
            })
    
    # 응답
    if current.type == 'admin':
        return {
            "user_type": "admin",
            "total_supply": total_supply,
            "total_sale": total_sale,
            "total_quantity": total_quantity,
            "order_count": order_count,
            "top_products": product_list
        }
    else:
        # 입점사용 처리
        seller_products = []
        for p in product_list:
            seller_products.append({
                "product_name": p["product_name"],
                "quantity": p["quantity"],
                "supply_amount": p["supply_amount"],
                "percentage": round((p["supply_amount"] / total_supply * 100), 1) if total_supply > 0 else 0
            })
        
        return {
            "user_type": "seller",
            "total_revenue": total_supply,
            "total_quantity": total_quantity,
            "order_count": order_count,
            "top_products": seller_products
        }
    
@router.post("/stats/refresh")
def refresh_statistics(
    body: dict = Body({"days": 30}),
    db: Session = Depends(get_db),
    current: Account = Depends(admin_only)
):
    """통계 데이터 재계산 - 전체 재계산 방식"""
    from crud import recalculate_dashboard_summary_full, update_product_rankings
    from models import Seller
    
    days = body.get("days", 30)
    
    # 기간 설정 (0이면 전체)
    if days == 0:
        # 전체 기간 재계산
        print(f"전체 기간 통계 재계산 시작")
    else:
        # 특정 기간만 재계산 (하지만 현재는 전체 재계산으로 처리)
        print(f"최근 {days}일 통계 재계산 시작")
    
    # 모든 입점사 ID 가져오기
    seller_ids = db.query(Seller.id).all()
    seller_ids = [s[0] for s in seller_ids]
    
    # 전체(0) 추가
    seller_ids.append(TOTAL_STATS_SELLER_ID)
    
    # 각 입점사별로 전체 재계산
    processed = 0
    for seller_id in seller_ids:
        recalculate_dashboard_summary_full(db, seller_id)
        processed += 1
    
    # 랭킹 재계산
    update_product_rankings(db)
    
    db.commit()
    
    return {
        "success": True, 
        "processed_sellers": processed,
        "message": f"통계 재계산 완료 (기간: {'전체' if days == 0 else f'최근 {days}일'})"
    }