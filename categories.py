"""Справочники без внешних зависимостей: валюта и категории расходов."""

CURRENCY = "KZT"
CURRENCY_SYMBOL = "₸"

CATEGORIES: list[dict[str, str]] = [
    {"id": "food", "title": "Еда"},
    {"id": "transport", "title": "Транспорт"},
    {"id": "housing", "title": "Жильё"},
    {"id": "education", "title": "Учёба"},
    {"id": "health", "title": "Здоровье"},
    {"id": "entertainment", "title": "Развлечения"},
    {"id": "clothes", "title": "Одежда"},
    {"id": "other", "title": "Другое"},
]

CATEGORY_IDS = {c["id"] for c in CATEGORIES}


def category_title(category_id: str) -> str:
    for c in CATEGORIES:
        if c["id"] == category_id:
            return c["title"]
    return category_id
