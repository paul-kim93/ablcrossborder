from db import engine, Base
import models

# DB의 테이블을 모두 생성 (이미 있으면 스킵)
Base.metadata.create_all(bind=engine)

print("DB 테이블 생성 완료!")
