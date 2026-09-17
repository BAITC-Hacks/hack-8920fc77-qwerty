"""Слой хранения: SQLite через стандартную библиотеку (без внешних ORM)."""

import os
import sqlite3
from contextlib import contextmanager
from typing import Any, Iterator

DB_PATH = os.environ.get(
    "EXPENSES_DB",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "expenses.db"),
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS expenses (
    id         TEXT PRIMARY KEY,
    amount     REAL NOT NULL CHECK (amount > 0),
    category   TEXT NOT NULL,
    spent_on   TEXT NOT NULL,            -- YYYY-MM-DD
    note       TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_spent_on ON expenses (spent_on);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses (category);
"""


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "amount": round(float(row["amount"]), 2),
        "category": row["category"],
        "date": row["spent_on"],
        "note": row["note"],
        "created_at": row["created_at"],
    }


def insert_expense(item: dict[str, Any]) -> dict[str, Any]:
    with connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO expenses (id, amount, category, spent_on, note, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (
                item["id"],
                item["amount"],
                item["category"],
                item["date"],
                item["note"],
                item["created_at"],
            ),
        )
        row = conn.execute("SELECT * FROM expenses WHERE id = ?", (item["id"],)).fetchone()
    return row_to_dict(row)


def list_expenses(month: str | None = None) -> list[dict[str, Any]]:
    query = "SELECT * FROM expenses"
    params: tuple = ()
    if month:
        query += " WHERE substr(spent_on, 1, 7) = ?"
        params = (month,)
    query += " ORDER BY spent_on DESC, created_at DESC"
    with connect() as conn:
        rows = conn.execute(query, params).fetchall()
    return [row_to_dict(r) for r in rows]


def delete_expense(expense_id: str) -> bool:
    with connect() as conn:
        cur = conn.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
    return cur.rowcount > 0


def clear_all() -> int:
    with connect() as conn:
        cur = conn.execute("DELETE FROM expenses")
    return cur.rowcount


def available_months() -> list[str]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT DISTINCT substr(spent_on, 1, 7) AS m FROM expenses ORDER BY m DESC"
        ).fetchall()
    return [r["m"] for r in rows]
