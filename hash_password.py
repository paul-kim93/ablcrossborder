from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

password = "abl1234"  # 원하는 패스워드로 바꾸세요
print(pwd_context.hash(password))
