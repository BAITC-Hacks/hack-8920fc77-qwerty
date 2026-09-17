"""REST API учёта личных расходов студента.

Запуск: uvicorn app.main:app --reload --port 8000  (из папки backend)
Документация: http://localhost:8000/docs
"""

import os
import uuid
from datetime import date, datetime
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import analytics, database
from .schemas import BulkIn, ExpenseIn, month_key, public_meta

app = FastAPI(
    title="Учёт личных расходов студента",
    description="Backend для хакатон-кейса: ввод расходов, список, удаление, итоги и аналитика.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Таблицы создаются при импорте — приложение можно поднимать любым ASGI-сервером.
database.init_db()


def _new_record(payload: ExpenseIn) -> dict[str, Any]:
    return {
        "id": uuid.uuid4().hex,
        "amount": payload.amount,
        "category": payload.category,
        "date": payload.date,
        "note": payload.note,
        "created_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
    }


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "time": datetime.utcnow().isoformat(timespec="seconds") + "Z"}


@app.get("/api/meta")
def meta() -> dict[str, Any]:
    """Категории и валюта — фронтенд берёт справочники отсюда."""
    data = public_meta()
    data["months"] = database.available_months()
    data["today"] = date.today().isoformat()
    return data


@app.get("/api/expenses")
def get_expenses(month: str | None = Query(default=None, description="ГГГГ-ММ")) -> dict[str, Any]:
    if month:
        try:
            month = month_key(month)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
    items = database.list_expenses(month)
    return {"month": month, "count": len(items), "items": items}


@app.post("/api/expenses", status_code=201)
def create_expense(payload: ExpenseIn) -> dict[str, Any]:
    return database.insert_expense(_new_record(payload))


@app.delete("/api/expenses/{expense_id}")
def remove_expense(expense_id: str) -> dict[str, Any]:
    if not database.delete_expense(expense_id):
        raise HTTPException(status_code=404, detail="Расход не найден")
    return {"deleted": expense_id}


@app.post("/api/expenses/bulk")
def bulk_upload(payload: BulkIn) -> dict[str, Any]:
    """Переносит записи из браузера в базу (кнопка «Синхронизировать»)."""
    if payload.replace:
        database.clear_all()
    saved = [database.insert_expense(_new_record(item)) for item in payload.items]
    return {"saved": len(saved), "items": saved}


@app.get("/api/analytics/summary")
def analytics_summary(
    month: str = Query(..., description="ГГГГ-ММ"),
    budget: float | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    """Итог за месяц, разбивка по категориям и динамика к прошлому месяцу."""
    try:
        month = month_key(month)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return analytics.summary(database.list_expenses(), month, budget)


@app.get("/api/analytics/categories")
def analytics_categories(month: str = Query(..., description="ГГГГ-ММ")) -> dict[str, Any]:
    try:
        month = month_key(month)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    items = database.list_expenses(month)
    rows = analytics.by_category(items)
    return {
        "month": month,
        "total": analytics.total(items),
        "by_category": rows,
        "checksum_ok": abs(sum(r["amount"] for r in rows) - analytics.total(items)) < 0.01,
    }


@app.exception_handler(RequestValidationError)
def validation_handler(_request, exc: RequestValidationError) -> JSONResponse:
    """Понятное сообщение об ошибке вместо служебного формата pydantic."""
    fields = {}
    for err in exc.errors():
        name = err["loc"][-1] if err.get("loc") else "body"
        message = err.get("msg", "Некорректное значение").replace("Value error, ", "")
        if err.get("type") == "missing":
            message = "Поле обязательно для заполнения"
        elif err.get("type", "").startswith("float_") or "valid number" in message:
            message = "Сумма должна быть числом, например 1500"
        elif err.get("type", "").startswith("string_"):
            message = "Ожидается текстовое значение"
        fields[str(name)] = message
    return JSONResponse(
        status_code=422,
        content={"detail": "; ".join(fields.values()) or "Некорректные данные", "fields": fields},
    )


@app.exception_handler(ValueError)
def value_error_handler(_request, exc: ValueError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})


# Фронтенд отдаётся тем же процессом: http://localhost:8000/
_FRONTEND = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "frontend"
)
if os.path.isdir(_FRONTEND):
    app.mount("/", StaticFiles(directory=_FRONTEND, html=True), name="frontend")
