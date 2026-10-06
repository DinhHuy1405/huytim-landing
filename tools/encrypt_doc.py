#!/usr/bin/env python3
"""Tạo 1 mục tài liệu đã mã hóa để dán vào mảng DOCS trong index.html.

Cách dùng:
  python3 tools/encrypt_doc.py "Tên bộ tài liệu" "Mô tả ngắn" "https://drive.google.com/..." "MÃ-CỦA-BẠN"

Kết quả là 1 dòng JSON. Dán dòng đó vào mảng DOCS (trong index.html), cách nhau bằng dấu phẩy.
Link Drive thật không nằm trong file; chỉ giải ra được khi nhập đúng mã.
Mã không phân biệt hoa/thường, khoảng trắng 2 đầu bị bỏ qua.
"""
import sys, os, json, base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ITER = 200000

def enc(name, desc, link, code):
    salt, iv = os.urandom(16), os.urandom(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(code.strip().lower().encode())
    ct = AESGCM(key).encrypt(iv, link.encode(), None)
    b = lambda x: base64.b64encode(x).decode()
    return {"name": name, "desc": desc, "salt": b(salt), "iv": b(iv), "ct": b(ct)}

if __name__ == "__main__":
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    print(json.dumps(enc(*sys.argv[1:]), ensure_ascii=False))
