from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator


Role = Literal["customer", "admin"]
RoleInput = Literal["customer", "admin", "employee", "agent"]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterRequest(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=6, max_length=200)
    role: RoleInput = "customer"

    @field_validator("role")
    @classmethod
    def normalize_role(cls, v: str) -> str:
        vv = str(v or "").lower().strip()
        if vv in ("employee", "agent"):
            return "customer"
        if vv in ("customer", "admin"):
            return vv
        raise ValueError("Vai trò không hợp lệ")

    @field_validator("email")
    @classmethod
    def email_must_be_gmail(cls, v: EmailStr) -> EmailStr:
        v_str = str(v).lower()
        if not v_str.endswith("@gmail.com"):
            raise ValueError("Chỉ cho phép đăng ký với địa chỉ @gmail.com")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    id: int
    email: EmailStr
    name: str
    role: Role


class UserSelfUpdate(BaseModel):
    """Cập nhật hồ sơ (ít nhất một trường)."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    password: str | None = Field(default=None, min_length=6, max_length=200)


class AuthMeUpdateResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class AdminCreateUser(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=6, max_length=200)
    role: RoleInput = "customer"

    @field_validator("role")
    @classmethod
    def normalize_role(cls, v: str) -> str:
        vv = str(v or "").lower().strip()
        if vv in ("employee", "agent"):
            return "customer"
        if vv in ("customer", "admin"):
            return vv
        raise ValueError("Vai trò không hợp lệ")


class RoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    location: str = Field(min_length=1, max_length=200)
    capacity: int = Field(ge=1, le=1000)
    image_url: str = Field(default="", max_length=2000)
    amenities: list[str] = Field(default_factory=list)
    status: Literal["active", "inactive"] = "active"
    price: float = Field(ge=0, default=0)


class RoomUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    location: str | None = Field(default=None, min_length=1, max_length=200)
    capacity: int | None = Field(default=None, ge=1, le=1000)
    image_url: str | None = Field(default=None, max_length=2000)
    amenities: list[str] | None = None
    status: Literal["active", "inactive"] | None = None
    price: float | None = Field(default=None, ge=0)


class RoomPublic(BaseModel):
    id: int
    name: str
    location: str
    capacity: int
    image_url: str
    amenities: list[str]
    status: Literal["active", "inactive"]
    price: float = 0


class RoomCsvImportResult(BaseModel):
    created: int
    failed: int
    errors: list[str] = Field(default_factory=list)


class BookingCreate(BaseModel):
    room_id: int
    start_at: datetime
    end_at: datetime
    title: str = Field(min_length=1, max_length=300)
    notes: str = ""
    participant_count: int | None = Field(
        default=None,
        ge=1,
        le=1000,
        description="Số người tham gia dự kiến; không được vượt sức chứa phòng.",
    )


class BookingPublic(BaseModel):
    id: int
    room_id: int
    organizer_id: int
    start_at: datetime
    end_at: datetime
    title: str
    notes: str
    status: Literal["active", "cancelled"]


class BookingBusy(BaseModel):
    """Lịch bận phòng (không lộ thông tin cuộc họp/người đặt)."""

    id: int
    room_id: int
    start_at: datetime
    end_at: datetime
    status: Literal["active", "cancelled"]


class BookingDetail(BookingPublic):
    room_name: str = ""
    organizer_name: str = ""
    organizer_email: str = ""


class ErrorResponse(BaseModel):
    detail: str
    extra: dict[str, Any] | None = None


TicketPriority = Literal["low", "medium", "high"]
TicketStatus = Literal["open", "in_progress", "resolved", "closed", "reopened"]


class TicketCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=300)
    description: str = Field(min_length=1, max_length=20_000)
    priority: TicketPriority = "medium"
    category: str = Field(default="", max_length=200)
    room_id: int | None = None


class TicketUpdate(BaseModel):
    subject: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = Field(default=None, min_length=1, max_length=20_000)
    priority: TicketPriority | None = None
    status: TicketStatus | None = None
    category: str | None = Field(default=None, max_length=200)
    assignee_id: int | None = None
    room_id: int | None = None


class TicketPublic(BaseModel):
    id: int
    requester_id: int
    assignee_id: int | None
    subject: str
    description: str
    priority: TicketPriority
    status: TicketStatus
    category: str
    room_id: int | None
    created_at: datetime


class TicketCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=20_000)


class TicketCommentPublic(BaseModel):
    id: int
    ticket_id: int
    author_id: int
    body: str
    created_at: datetime
