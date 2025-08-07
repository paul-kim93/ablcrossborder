from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from db import Base

class Seller(Base):
    __tablename__ = "sellers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    contact = Column(String(50), nullable=False)

    products = relationship("Product", back_populates="seller")

class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    product_code = Column(String(50), nullable=False)
    seller_id = Column(Integer, ForeignKey("sellers.id"), nullable=False)
    supply_price = Column(Integer, nullable=False)
    sale_price = Column(Integer, nullable=False)
    current_stock = Column(Integer, nullable=False)
    thumbnail_url = Column(String(255))
    detail_image_url = Column(String(255))

    seller = relationship("Seller", back_populates="products")
