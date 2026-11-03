from __future__ import annotations

import json
import secrets

from .db import Store

# Fictional demo interpreters. Replace with real, consenting people for a live pilot.
_DEMO = [
    ("i1", "Mariam A.", ["UAE Sign Language", "International Sign"], ["medical", "government"], True, "Oud Metha", 0.97),
    ("i2", "Omar K.", ["UAE Sign Language"], ["legal", "government"], True, "Deira", 0.94),
    ("i3", "Sana R.", ["UAE Sign Language", "ASL"], ["education", "medical"], True, "Dubai Marina", 0.92),
    ("i4", "Daniel P.", ["ASL", "International Sign"], ["government", "other"], True, "Business Bay", 0.90),
    ("i5", "Fatima H.", ["UAE Sign Language"], ["medical", "education", "government"], False, "Mirdif", 0.88),
    ("i6", "Ravi N.", ["UAE Sign Language", "International Sign"], ["government", "other"], True, "Al Quoz", 0.90),
]


def seed(store: Store) -> None:
    if store.one("SELECT 1 FROM interpreters LIMIT 1"):
        return
    with store.tx():
        for id_, name, langs, doms, cert, area, rel in _DEMO:
            store.x(
                "INSERT INTO interpreters(id, name, token, languages, domains, certified, area, reliability) VALUES (?,?,?,?,?,?,?,?)",
                (id_, name, secrets.token_urlsafe(24), json.dumps(langs), json.dumps(doms), int(cert), area, rel),
            )
