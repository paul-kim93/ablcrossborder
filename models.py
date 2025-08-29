from sqlalchemy import (
    Column, Integer, String, ForeignKey, DateTime, Text, TIMESTAMP, Numeric, Date
)
from sqlalchemy.orm import relationship
    # NOTE: relationship은 필요한 곳만 설정
from sqlalchemy.sql import text
from db import Base

# -------------------------
# sellers
# -------------------------
class Seller(Base):
    __tablename__ = "sellers"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    contact = Column(String(50), nullable=True)

    created_at = Column(
        TIMESTAMP, nullable=False
    )
    updated_at = Column(
        TIMESTAMP, nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=text("CURRENT_TIMESTAMP")
    )

    products = relationship("Product", back_populates="seller")


# -------------------------
# products
# -------------------------
class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    product_code = Column(String(100), nullable=False, unique=True)
    seller_id = Column(Integer, ForeignKey("sellers.id"), nullable=False)

    initial_stock = Column(Integer, nullable=False)
    supply_price = Column(Numeric(18, 2), nullable=False)
    sale_price   = Column(Numeric(18, 2), nullable=False)

    thumbnail_url = Column(Text, nullable=True)
    detail_image_url = Column(Text, nullable=True)

    is_active = Column(Integer, nullable=False, default=1)  # 1/0

    created_at = Column(
        TIMESTAMP, nullable=False
    )
    updated_at = Column(
        TIMESTAMP, nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=text("CURRENT_TIMESTAMP")
    )

    seller = relationship("Seller", back_populates="products")


# -------------------------
# accounts
# -------------------------
class Account(Base):
    __tablename__ = "accounts"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String(50), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    # DB는 enum('admin','seller')지만 ORM은 문자열로 관리
    type = Column(String(20), nullable=False)  # 'admin' | 'seller'
    seller_id = Column(Integer, ForeignKey("sellers.id"), nullable=True)

    created_at = Column(
        TIMESTAMP, nullable=False
    )
    updated_at = Column(
        TIMESTAMP, nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=text("CURRENT_TIMESTAMP")
    )


# -------------------------
# orders
# -------------------------
class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    order_no = Column(String(100), nullable=False, unique=True)
    buyer_id = Column(String(100), nullable=True)
    order_time = Column(DateTime, nullable=False)
    status = Column(String(20), nullable=False)  # 추후 status_code/status_raw로 분리 예정

    created_at = Column(
        TIMESTAMP, nullable=False
    )


# -------------------------
# order_items
# -------------------------
class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    product_code = Column(String(100), nullable=False)
    seller_id_snapshot = Column(Integer, ForeignKey("sellers.id"), nullable=False)

    quantity = Column(Integer, nullable=False)
    supply_price = Column(Numeric(18, 2), nullable=False)
    sale_price   = Column(Numeric(18, 2), nullable=False)
    cny_amount   = Column(Numeric(12, 2), nullable=True)

    last_modified_at = Column(DateTime, nullable=True)
    last_modified_by = Column(Integer, ForeignKey("accounts.id"), nullable=True)

    created_at = Column(
        TIMESTAMP, nullable=False
    )


# -------------------------
# import_batches (관리자 전용)
# -------------------------
class ImportBatch(Base):
    __tablename__ = "import_batches"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    source_name = Column(String(255), nullable=False)
    hash = Column(String(64), nullable=True)
    row_count_total = Column(Integer, nullable=False)
    row_count_matched = Column(Integer, nullable=False)
    imported_by = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    imported_at = Column(
        TIMESTAMP, nullable=False
    )


# -------------------------
# stock_adjustments
# -------------------------
class StockAdjustment(Base):
    __tablename__ = "stock_adjustments"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    delta_qty = Column(Integer, nullable=False)
    reason = Column(String(20), nullable=False)  # 'receipt','disposal','correction','other'
    note = Column(String(255), nullable=True)
    adjusted_by = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    adjusted_at = Column(DateTime, nullable=False)
    created_at = Column(
        TIMESTAMP, nullable=False
    )


# -------------------------
# order_item_audits (선택)
# -------------------------
class OrderItemAudit(Base):
    __tablename__ = "order_item_audits"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    order_item_id = Column(Integer, ForeignKey("order_items.id"), nullable=False)
    changed_by = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    changed_at = Column(DateTime, nullable=False)
    from_supply_price = Column(Numeric(18, 2), nullable=True)
    to_supply_price   = Column(Numeric(18, 2), nullable=True)
    from_sale_price   = Column(Numeric(18, 2), nullable=True)
    to_sale_price     = Column(Numeric(18, 2), nullable=True)
    note = Column(String(255), nullable=True)


# models.py에 추가할 내용
class DashboardSummary(Base):
    __tablename__ = "dashboard_summary"
    
    id = Column(Integer, primary_key=True)
    seller_id = Column(Integer, ForeignKey("sellers.id"), nullable=False)
    
    # 누적
    total_supply_amount = Column(Numeric(18, 2), default=0)
    total_sale_amount = Column(Numeric(18, 2), default=0)
    total_quantity = Column(Integer, default=0)
    
    # 이번달
    month_supply_amount = Column(Numeric(18, 2), default=0)
    month_sale_amount = Column(Numeric(18, 2), default=0)
    month_quantity = Column(Integer, default=0)
    
    # 이번주
    week_supply_amount = Column(Numeric(18, 2), default=0)
    week_sale_amount = Column(Numeric(18, 2), default=0)
    week_quantity = Column(Integer, default=0)
    
    # 전일
    yesterday_supply_amount = Column(Numeric(18, 2), default=0)
    yesterday_sale_amount = Column(Numeric(18, 2), default=0)
    yesterday_quantity = Column(Integer, default=0)
    
    last_updated = Column(DateTime, nullable=True)

class ProductRankings(Base):
    __tablename__ = "product_rankings"
    
    id = Column(Integer, primary_key=True)
    scope_type = Column(String(20), nullable=False)
    seller_id = Column(Integer, ForeignKey("sellers.id"), nullable=True)
    period_type = Column(String(20), nullable=False)
    rank_type = Column(String(20), nullable=False)
    rank = Column(Integer, nullable=False)
    
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    product_name = Column(String(255), nullable=False)
    seller_name = Column(String(100), nullable=True)
    
    amount = Column(Numeric(18, 2), default=0)
    quantity = Column(Integer, default=0)
    
    last_updated = Column(DateTime, nullable=True)


class ProductImage(Base):
    __tablename__ = "product_images"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    image_url = Column(String(500), nullable=False)
    display_order = Column(Integer, default=0)
    created_at = Column(TIMESTAMP, nullable=False, server_default=text("CURRENT_TIMESTAMP"))

    # models.py 끝에 추가
class ProductCodeMapping(Base):
    __tablename__ = "product_code_mappings"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    mapped_code = Column(String(100), nullable=False, unique=True)
    quantity_multiplier = Column(Integer, default=1)
    mapping_type = Column(String(20), default='alias')
    note = Column(String(255), nullable=True)
    created_at = Column(TIMESTAMP, nullable=False, server_default=text("CURRENT_TIMESTAMP"))

class ProductShipment(Base):
    __tablename__ = 'product_shipments'
    
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey('products.id'))
    shipment_no = Column(String(50))
    arrival_date = Column(Date)
    initial_quantity = Column(Integer)
    current_quantity = Column(Integer)
    remaining_quantity = Column(Integer)
    supply_price = Column(Numeric(18, 2))
    sale_price = Column(Numeric(18, 2))
    is_active = Column(Integer, default=1)
    created_by = Column(Integer, ForeignKey('accounts.id'))
    created_at = Column(DateTime)
    updated_at = Column(DateTime)

class ShipmentPriceHistory(Base):
    __tablename__ = 'shipment_price_history'
    
    id = Column(Integer, primary_key=True)
    shipment_id = Column(Integer, ForeignKey('product_shipments.id'))
    supply_price = Column(Numeric(18, 2))
    sale_price = Column(Numeric(18, 2))
    effective_date = Column(Date)
    reason = Column(String(255))
    changed_by = Column(Integer, ForeignKey('accounts.id'))
    created_at = Column(DateTime)

class ShipmentStockAdjustment(Base):
    __tablename__ = 'shipment_stock_adjustments'
    
    id = Column(Integer, primary_key=True)
    shipment_id = Column(Integer, ForeignKey('product_shipments.id'))
    adjustment_type = Column(String(20))
    quantity_delta = Column(Integer)
    reason = Column(String(255))
    adjusted_by = Column(Integer, ForeignKey('accounts.id'))
    adjusted_at = Column(DateTime)