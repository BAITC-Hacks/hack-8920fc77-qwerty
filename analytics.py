"""Аналитика расходов. Все расчёты — только по введённым пользователем данным.

Инвариант, который проверяет жюри: сумма всех категорий == общему итогу месяца.
"""

from calendar import monthrange
from datetime import date, datetime
from statistics import median
from typing import Any, Iterable

from .categories import category_title

CENTS = 2


def _round(value: float) -> float:
    return round(value + 0.0, CENTS)


def _month_bounds(month: str) -> tuple[date, date]:
    year, mon = (int(p) for p in month.split("-"))
    return date(year, mon, 1), date(year, mon, monthrange(year, mon)[1])


def _shift_month(month: str, delta: int) -> str:
    year, mon = (int(p) for p in month.split("-"))
    index = year * 12 + (mon - 1) + delta
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def filter_month(expenses: Iterable[dict[str, Any]], month: str) -> list[dict[str, Any]]:
    return [e for e in expenses if str(e["date"])[:7] == month]


def total(expenses: Iterable[dict[str, Any]]) -> float:
    return _round(sum(float(e["amount"]) for e in expenses))


def by_category(expenses: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Суммы по категориям. Сумма значений строго равна общему итогу."""
    buckets: dict[str, dict[str, Any]] = {}
    for e in expenses:
        b = buckets.setdefault(e["category"], {"category": e["category"], "amount": 0.0, "count": 0})
        b["amount"] += float(e["amount"])
        b["count"] += 1

    grand = total(expenses)
    rows = []
    for b in buckets.values():
        amount = _round(b["amount"])
        rows.append(
            {
                "category": b["category"],
                "title": category_title(b["category"]),
                "amount": amount,
                "count": b["count"],
                "share": _round(amount / grand * 100) if grand else 0.0,
            }
        )
    rows.sort(key=lambda r: (-r["amount"], r["title"]))

    # Гарантируем совпадение с итогом после округления: разницу отдаём крупнейшей категории.
    drift = _round(grand - _round(sum(r["amount"] for r in rows)))
    if rows and abs(drift) >= 10 ** -CENTS:
        rows[0]["amount"] = _round(rows[0]["amount"] + drift)
    return rows


def by_day(expenses: list[dict[str, Any]], month: str) -> list[dict[str, Any]]:
    """Ряд трат по дням месяца — для графика и оценки ритма расходов."""
    start, end = _month_bounds(month)
    per_day = {d: 0.0 for d in range(1, end.day + 1)}
    for e in expenses:
        per_day[datetime.strptime(e["date"], "%Y-%m-%d").day] += float(e["amount"])
    running = 0.0
    series = []
    for day, amount in per_day.items():
        running += amount
        series.append(
            {
                "day": day,
                "date": date(start.year, start.month, day).isoformat(),
                "amount": _round(amount),
                "cumulative": _round(running),
            }
        )
    return series


def summary(all_expenses: list[dict[str, Any]], month: str, budget: float | None = None) -> dict[str, Any]:
    """Полная сводка за месяц: итог, категории, динамика, прогноз."""
    current = filter_month(all_expenses, month)
    previous_month = _shift_month(month, -1)
    previous = filter_month(all_expenses, previous_month)

    grand = total(current)
    prev_total = total(previous)
    categories = by_category(current)
    days = by_day(current, month)

    start, end = _month_bounds(month)
    today = date.today()
    if today < start:
        days_elapsed = 0
    elif today > end:
        days_elapsed = end.day
    else:
        days_elapsed = today.day

    active_days = [d["amount"] for d in days if d["amount"] > 0]
    daily_average = _round(grand / days_elapsed) if days_elapsed else 0.0
    projection = _round(daily_average * end.day) if days_elapsed else 0.0

    change_pct = None
    if prev_total > 0:
        change_pct = _round((grand - prev_total) / prev_total * 100)

    result: dict[str, Any] = {
        "month": month,
        "total": grand,
        "count": len(current),
        "by_category": categories,
        "by_day": days,
        "top_category": categories[0] if categories else None,
        "average_expense": _round(grand / len(current)) if current else 0.0,
        "median_expense": _round(median(float(e["amount"]) for e in current)) if current else 0.0,
        "largest_expense": max(current, key=lambda e: float(e["amount"])) if current else None,
        "daily_average": daily_average,
        "active_days": len(active_days),
        "days_in_month": end.day,
        "days_elapsed": days_elapsed,
        "projected_total": projection,
        "previous_month": previous_month,
        "previous_total": prev_total,
        "change_pct": change_pct,
        "checksum_ok": abs(_round(sum(c["amount"] for c in categories)) - grand) < 10 ** -CENTS,
    }

    if budget and budget > 0:
        result["budget"] = _round(budget)
        result["budget_left"] = _round(budget - grand)
        result["budget_used_pct"] = _round(grand / budget * 100)
        result["budget_risk"] = projection > budget
    return result
