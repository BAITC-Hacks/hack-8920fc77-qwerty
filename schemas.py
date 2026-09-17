"""Проверка входных данных. Одна валюта, без конвертации."""

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from .categories import CATEGORIES, CATEGORY_IDS, CURRENCY, CURRENCY_SYMBOL, category_title

MAX_AMOUNT = 100_000_000
MAX_NOTE = 140


class ExpenseIn(BaseModel):
    amount: float = Field(..., description="Положительная сумма в одной валюте")
    category: str
    date: str = Field(..., description="Дата в формате YYYY-MM-DD")
    note: str = ""

    @field_validator("amount")
    @classmethod
    def check_amount(cls, v: float) -> float:
        if v is None:
            raise ValueError("Введите сумму расхода")
        if v != v or v in (float("inf"), float("-inf")):
            raise ValueError("Сумма должна быть числом")
        if v <= 0:
            raise ValueError("Сумма должна быть больше нуля")
        if v > MAX_AMOUNT:
            raise ValueError(f"Сумма не может превышать {MAX_AMOUNT:,}".replace(",", " "))
        return round(float(v), 2)

    @field_validator("category")
    @classmethod
    def check_category(cls, v: str) -> str:
        if v not in CATEGORY_IDS:
            raise ValueError("Выберите категорию из списка")
        return v

    @field_validator("date")
    @classmethod
    def check_date(cls, v: str) -> str:
        try:
            parsed = datetime.strptime(v, "%Y-%m-%d").date()
        except (TypeError, ValueError):
            raise ValueError("Дата должна быть в формате ГГГГ-ММ-ДД")
        if parsed.year < 2000 or parsed > date.today().replace(year=date.today().year + 1):
            raise ValueError("Дата вне допустимого диапазона")
        return parsed.isoformat()

    @field_validator("note")
    @classmethod
    def check_note(cls, v: str) -> str:
        v = (v or "").strip()
        if len(v) > MAX_NOTE:
            raise ValueError(f"Описание длиннее {MAX_NOTE} символов")
        return v


class ExpenseOut(BaseModel):
    id: str
    amount: float
    category: str
    date: str
    note: str
    created_at: str


class BulkIn(BaseModel):
    """Синхронизация записей из localStorage в базу."""

    items: list[ExpenseIn]
    replace: bool = False


def month_key(value: str) -> str:
    """Проверяет месяц вида YYYY-MM."""
    try:
        datetime.strptime(value, "%Y-%m")
    except (TypeError, ValueError):
        raise ValueError("Месяц должен быть в формате ГГГГ-ММ")
    return value



def public_meta() -> dict[str, Any]:
    return {"currency": CURRENCY, "symbol": CURRENCY_SYMBOL, "categories": CATEGORIES}
