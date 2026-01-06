import os
from pathlib import Path

from PIL import Image
import imagehash

# مسار مجلد الصور داخل مشروعك
IMAGES_DIR = Path(r"d:\files (5)\artrova-ultimate-final\artrova-ultimate-final\images")

# أقصى مسافة نعتبر عندها الصور متشابهة جداً
NEAR_DUP_DISTANCE = 3

def iter_image_files(folder: Path):
    exts = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}
    for root, _, files in os.walk(folder):
        for name in files:
            if Path(name).suffix.lower() in exts:
                yield Path(root) / name

def main():
    if not IMAGES_DIR.exists():
        print(f"[ERROR] Folder not found: {IMAGES_DIR}")
        return

    print(f"Scanning images in: {IMAGES_DIR}\n")

    hashes = {}   # path -> hash
    by_hash = {}  # exact hash string -> [paths]

    # 1) حساب الهاش لكل صورة
    for img_path in iter_image_files(IMAGES_DIR):
        try:
            with Image.open(img_path) as img:
                h = imagehash.phash(img)
        except Exception as e:
            print(f"[WARN] Could not open {img_path}: {e}")
            continue

        hashes[img_path] = h
        by_hash.setdefault(str(h), []).append(img_path)

    # 2) صور متطابقة تماماً
    print("===== EXACT DUPLICATES =====")
    any_exact = False
    for h_value, paths in by_hash.items():
        if len(paths) > 1:
            any_exact = True
            print(f"\nHash: {h_value}")
            for p in paths:
                print(f"  - {p}")
    if not any_exact:
        print("لا توجد صور متطابقة تماماً.")

    # 3) صور متشابهة جداً
    print("\n===== NEAR DUPLICATES =====")
    checked_pairs = set()
    any_near = False
    img_paths = list(hashes.keys())

    for i in range(len(img_paths)):
        for j in range(i + 1, len(img_paths)):
            p1, p2 = img_paths[i], img_paths[j]
            if (p1, p2) in checked_pairs:
                continue
            checked_pairs.add((p1, p2))

            dist = hashes[p1] - hashes[p2]
            if dist <= NEAR_DUP_DISTANCE:
                any_near = True
                print(f"\n[distance={dist}]")
                print(f"  - {p1}")
                print(f"  - {p2}")

    if not any_near:
        print("لا توجد صور متشابهة جداً حسب العتبة المحددة.")

if __name__ == "__main__":
    main()