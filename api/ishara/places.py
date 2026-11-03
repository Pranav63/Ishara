from __future__ import annotations

import math

# Approximate neighbourhood centroids. Travel times are estimates until the RTA open API is wired in.
PLACES = {
    "Oud Metha": (25.2355, 55.3140),
    "Healthcare City": (25.2310, 55.3200),
    "Deira": (25.2697, 55.3095),
    "Bur Dubai": (25.2532, 55.2972),
    "Karama": (25.2459, 55.3030),
    "Al Quoz": (25.1417, 55.2276),
    "Jumeirah": (25.2048, 55.2430),
    "Dubai Marina": (25.0805, 55.1403),
    "JLT": (25.0657, 55.1413),
    "Business Bay": (25.1850, 55.2620),
    "Downtown": (25.1972, 55.2744),
    "Al Barsha": (25.1124, 55.2000),
    "Dubai Silicon Oasis": (25.1281, 55.3817),
    "Mirdif": (25.2210, 55.4200),
    "Al Qusais": (25.2870, 55.3790),
    "Al Nahda": (25.2900, 55.3720),
}

# keyword -> (display name, area, domain)
ENTITIES = {
    "rashid hospital": ("Rashid Hospital", "Oud Metha", "medical"),
    "latifa hospital": ("Latifa Hospital", "Oud Metha", "medical"),
    "american hospital": ("American Hospital Dubai", "Oud Metha", "medical"),
    "mediclinic city": ("Mediclinic City Hospital", "Healthcare City", "medical"),
    "dubai hospital": ("Dubai Hospital", "Deira", "medical"),
}


def travel_minutes(a: str, b: str) -> int:
    """Road-distance estimate in minutes between two known areas."""
    (la1, lo1), (la2, lo2) = PLACES[a], PLACES[b]
    p1, p2 = math.radians(la1), math.radians(la2)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lo2 - lo1) / 2) ** 2
    km = 2 * 6371 * math.asin(math.sqrt(h)) * 1.35  # straight line to road factor
    return int(round(km / 40 * 60 + 8))
