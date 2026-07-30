import time
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
hash = pwd_context.hash("password123")

start = time.time()
pwd_context.verify("password123", hash)
end = time.time()
print(f"Time to verify with default settings: {end - start:.4f} seconds")

pwd_context_fast = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=4)
hash_fast = pwd_context_fast.hash("password123")

start = time.time()
pwd_context_fast.verify("password123", hash_fast)
end = time.time()
print(f"Time to verify with 4 rounds: {end - start:.4f} seconds")
