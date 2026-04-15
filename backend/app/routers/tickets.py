from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from ..db import db
from ..schemas import (
    TicketCommentCreate,
    TicketCommentPublic,
    TicketCreate,
    TicketPublic,
    TicketUpdate,
)
from ..security import get_current_user, require_role


router = APIRouter(prefix="/tickets", tags=["tickets"])


def _parse_sqlite_dt(s: str) -> datetime:
    # sqlite datetime('now') returns "YYYY-MM-DD HH:MM:SS"
    # This is naive; treat as local/naive for now (ok for MVP).
    try:
        return datetime.fromisoformat(s.replace(" ", "T"))
    except ValueError:
        return datetime.fromisoformat(s)


def _row_to_ticket(row) -> dict:
    return {
        "id": row["id"],
        "requester_id": row["requester_id"],
        "assignee_id": row["assignee_id"],
        "subject": row["subject"],
        "description": row["description"],
        "priority": row["priority"],
        "status": row["status"],
        "category": row["category"],
        "room_id": row["room_id"],
        "created_at": _parse_sqlite_dt(row["created_at"]),
    }


def _row_to_comment(row) -> dict:
    return {
        "id": row["id"],
        "ticket_id": row["ticket_id"],
        "author_id": row["author_id"],
        "body": row["body"],
        "created_at": _parse_sqlite_dt(row["created_at"]),
    }


@router.get("", response_model=list[TicketPublic])
def list_tickets(
    user=Depends(get_current_user),
    status_: str | None = None,
    priority: str | None = None,
    mine: bool = False,
):
    where = []
    params: list[object] = []

    if status_:
        where.append("status = ?")
        params.append(status_)
    if priority:
        where.append("priority = ?")
        params.append(priority)
    if mine:
        where.append("(requester_id = ? OR assignee_id = ?)")
        params.extend([user["id"], user["id"]])

    sql = """
      SELECT id, requester_id, assignee_id, subject, description, priority, status, category, room_id, created_at
      FROM tickets
    """
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY created_at DESC"

    with db() as conn:
        rows = conn.execute(sql, tuple(params)).fetchall()
        return [_row_to_ticket(r) for r in rows]


@router.post("", response_model=TicketPublic)
def create_ticket(body: TicketCreate, user=Depends(get_current_user)):
    with db() as conn:
        if body.room_id is not None:
            room = conn.execute("SELECT id FROM rooms WHERE id = ?", (body.room_id,)).fetchone()
            if not room:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

        cur = conn.execute(
            """
            INSERT INTO tickets(requester_id, assignee_id, subject, description, priority, status, category, room_id)
            VALUES(?, NULL, ?, ?, ?, 'open', ?, ?)
            """,
            (user["id"], body.subject, body.description, body.priority, body.category, body.room_id),
        )
        ticket_id = int(cur.lastrowid)
        row = conn.execute(
            """
            SELECT id, requester_id, assignee_id, subject, description, priority, status, category, room_id, created_at
            FROM tickets
            WHERE id = ?
            """,
            (ticket_id,),
        ).fetchone()
        return _row_to_ticket(row)


@router.get("/{ticket_id}", response_model=TicketPublic)
def get_ticket(ticket_id: int, user=Depends(get_current_user)):
    with db() as conn:
        row = conn.execute(
            """
            SELECT id, requester_id, assignee_id, subject, description, priority, status, category, room_id, created_at
            FROM tickets
            WHERE id = ?
            """,
            (ticket_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
        return _row_to_ticket(row)


@router.get("/{ticket_id}/comments", response_model=list[TicketCommentPublic])
def list_comments(ticket_id: int, user=Depends(get_current_user)):
    with db() as conn:
        exists = conn.execute("SELECT id FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
        if not exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

        rows = conn.execute(
            """
            SELECT id, ticket_id, author_id, body, created_at
            FROM ticket_comments
            WHERE ticket_id = ?
            ORDER BY created_at ASC
            """,
            (ticket_id,),
        ).fetchall()
        return [_row_to_comment(r) for r in rows]


@router.post("/{ticket_id}/comments", response_model=TicketCommentPublic)
def add_comment(ticket_id: int, body: TicketCommentCreate, user=Depends(get_current_user)):
    with db() as conn:
        exists = conn.execute("SELECT id FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
        if not exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

        cur = conn.execute(
            "INSERT INTO ticket_comments(ticket_id, author_id, body) VALUES(?,?,?)",
            (ticket_id, user["id"], body.body),
        )
        comment_id = int(cur.lastrowid)
        row = conn.execute(
            "SELECT id, ticket_id, author_id, body, created_at FROM ticket_comments WHERE id = ?",
            (comment_id,),
        ).fetchone()
        return _row_to_comment(row)


@router.patch("/{ticket_id}", response_model=TicketPublic)
def update_ticket(ticket_id: int, body: TicketUpdate, user=Depends(get_current_user)):
    with db() as conn:
        existing = conn.execute(
            """
            SELECT id, requester_id, assignee_id, subject, description, priority, status, category, room_id, created_at
            FROM tickets
            WHERE id = ?
            """,
            (ticket_id,),
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

        is_requester = existing["requester_id"] == user["id"]
        is_admin = user["role"] == "admin"
        if not is_requester and not is_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        # Requester can update subject/description/priority/category/room_id while ticket not closed
        # Admin có thể update status + assignee_id
        subject = body.subject if body.subject is not None else existing["subject"]
        description = body.description if body.description is not None else existing["description"]
        priority = body.priority if body.priority is not None else existing["priority"]
        category = body.category if body.category is not None else existing["category"]
        room_id = body.room_id if body.room_id is not None else existing["room_id"]
        status_value = existing["status"]
        assignee_id = existing["assignee_id"]

        if room_id is not None:
            room = conn.execute("SELECT id FROM rooms WHERE id = ?", (room_id,)).fetchone()
            if not room:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

        if is_admin:
            if body.status is not None:
                status_value = body.status
            if body.assignee_id is not None:
                assignee_id = body.assignee_id
        else:
            # requester cannot assign/status change
            if body.status is not None or body.assignee_id is not None:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        conn.execute(
            """
            UPDATE tickets
            SET subject = ?, description = ?, priority = ?, status = ?, category = ?, assignee_id = ?, room_id = ?
            WHERE id = ?
            """,
            (subject, description, priority, status_value, category, assignee_id, room_id, ticket_id),
        )
        row = conn.execute(
            """
            SELECT id, requester_id, assignee_id, subject, description, priority, status, category, room_id, created_at
            FROM tickets
            WHERE id = ?
            """,
            (ticket_id,),
        ).fetchone()
        return _row_to_ticket(row)


@router.post("/{ticket_id}/assign/{assignee_id}", response_model=TicketPublic, dependencies=[Depends(require_role("admin"))])
def assign_ticket(ticket_id: int, assignee_id: int):
    with db() as conn:
        ticket = conn.execute("SELECT id FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
        if not ticket:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
        conn.execute("UPDATE tickets SET assignee_id = ?, status = 'in_progress' WHERE id = ?", (assignee_id, ticket_id))
        row = conn.execute(
            """
            SELECT id, requester_id, assignee_id, subject, description, priority, status, category, room_id, created_at
            FROM tickets
            WHERE id = ?
            """,
            (ticket_id,),
        ).fetchone()
        return _row_to_ticket(row)

