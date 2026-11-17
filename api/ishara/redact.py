from __future__ import annotations

import re

# Applied before anything is stored or sent to a model.
_RULES = [
    ("EMIRATES_ID", re.compile(r"\b784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d\b")),
    ("EMAIL", re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")),
    ("PHONE", re.compile(r"(?<![\d:/.])(?:\+?971|00971|0)[\s-]?(?:5\d|[2-9])[\s-]?\d{3}[\s-]?\d{4}(?!\d)")),
    ("NUMBER", re.compile(r"(?<![\d:/.-])\d{8,}(?![\d:/.-])")),
]

# Arabic-Indic and Persian digits become ASCII, so the rules above (and the parser) see them.
DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "0123456789" * 2)


def redact(text: str) -> tuple:
    """Return (clean_text, number_of_replacements)."""
    text = text.translate(DIGITS)
    count = 0
    for label, rx in _RULES:
        text, n = rx.subn(f"[{label}]", text)
        count += n
    return text, count
