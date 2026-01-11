import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
INDEX = ROOT / 'index.html'


def remove_first_block(s: str, start: str, end: str, *, include_end: bool = True) -> tuple[str, bool]:
    i = s.find(start)
    if i == -1:
        return s, False
    j = s.find(end, i + len(start))
    if j == -1:
        return s, False
    j2 = j + (len(end) if include_end else 0)
    return s[:i] + s[j2:], True


def main() -> int:
    if not INDEX.exists():
        print('ERROR: index.html not found at', INDEX)
        return 2

    s = INDEX.read_text(encoding='utf-8')
    orig = s

    # 1) Remove hamburger button
    s, _ = remove_first_block(
        s,
        '<button type="button" class="mobile-menu-toggle"',
        '</button>',
        include_end=True,
    )

    # 2) Remove mobile nav backdrop (comment + div) up to (but not including) next comment
    s, _ = remove_first_block(
        s,
        '<!-- خلفية قائمة الموبايل -->',
        '<!-- قائمة الموبايل -->',
        include_end=False,
    )

    # 3) Remove mobile nav menu block up to hero section comment
    s, _ = remove_first_block(
        s,
        '<!-- قائمة الموبايل -->',
        '<!-- الهيرو الجديد - سلايدر كامل الشاشة -->',
        include_end=False,
    )

    # 4) Remove the bottom sticky CTA bar (keep whatsapp-float)
    s, _ = remove_first_block(
        s,
        '<div class="mobile-sticky-cta"',
        '</div>',
        include_end=True,
    )

    if s == orig:
        print('No changes applied (markers not found).')
        return 1

    INDEX.write_text(s, encoding='utf-8')
    print('OK: removed mobile menu + bottom CTA; kept whatsapp-float')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
