from typing import List
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from models import Account, Seller
from db import get_db
from auth import admin_only, get_password_hash, get_current_account  # get_current_account 추가
from crud import get_korea_time_naive
from schemas import AccountCreate, AccountUpdate, AccountOut

router = APIRouter()

# === Accounts CRUD ===
@router.post("/accounts", response_model=AccountOut)
def create_account(body: AccountCreate, db: Session = Depends(get_db), current: Account = Depends(admin_only)):
    if db.query(Account).filter(Account.username == body.username).first():
        raise HTTPException(status_code=400, detail="이미 존재하는 아이디")
    if body.type == "seller" and body.seller_id and not db.query(Seller).filter(Seller.id == body.seller_id).first():
        raise HTTPException(status_code=400, detail="존재하지 않는 입점사 id")

    acc = Account(
        username=body.username,
        password_hash=get_password_hash(body.password),
        type=body.type,
        seller_id=body.seller_id,
        created_at=get_korea_time_naive(),  # 추가
        updated_at=get_korea_time_naive()   # 추가
    )
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return acc

@router.get("/accounts", response_model=List[AccountOut])
def list_accounts(db: Session = Depends(get_db), current: Account = Depends(admin_only)):
    # 단순 쿼리로 빠르게 조회
    accounts = db.query(Account).all()
    
    # 필요한 경우 seller 정보를 한 번에 조회
    seller_ids = [acc.seller_id for acc in accounts if acc.seller_id]
    if seller_ids:
        sellers = db.query(Seller).filter(Seller.id.in_(seller_ids)).all()
        seller_map = {s.id: s for s in sellers}
        
        # 메모리에서 매핑 (DB 쿼리 줄이기)
        for acc in accounts:
            if acc.seller_id:
                acc._seller = seller_map.get(acc.seller_id)
    
    return accounts

@router.put("/accounts/{account_id}", response_model=AccountOut)
def update_account(
    account_id: int,
    body: AccountUpdate,
    db: Session = Depends(get_db),
    current: Account = Depends(admin_only)
):
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="계정 없음")

    if body.password:
        acc.password_hash = get_password_hash(body.password)
    if body.type:
        acc.type = body.type
    if body.seller_id is not None:
        # seller 타입일 때만 입점사 존재 확인
        if body.type == "seller" and body.seller_id:
            if not db.query(Seller).filter(Seller.id == body.seller_id).first():
                raise HTTPException(status_code=400, detail="존재하지 않는 입점사 id")
        acc.seller_id = body.seller_id

    db.commit()
    db.refresh(acc)
    return acc

@router.delete("/accounts/{account_id}")
def delete_account(account_id: int, db: Session = Depends(get_db), current: Account = Depends(admin_only)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="계정 없음")
    
    # 현재 로그인한 계정은 삭제 불가
    if account.username == current.username:
        raise HTTPException(status_code=400, detail="자기 자신은 삭제할 수 없습니다")
    
    db.delete(account)
    db.commit()
    return {"ok": True, "message": "계정이 삭제되었습니다"}
