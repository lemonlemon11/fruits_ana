"""用户端站内通知读取接口。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..auth import require_current_user
from ..db import get_db
from ..models import AdminNotification, AdminNotificationRecipient, User, utc_now
from ..schemas import (
    NotificationListResponse,
    NotificationRead,
    NotificationUnreadCount,
)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _visible_notifications(db: Session, user_id: int):
    now = utc_now()
    return (
        db.query(AdminNotification, AdminNotificationRecipient)
        .join(
            AdminNotificationRecipient,
            AdminNotificationRecipient.notification_id == AdminNotification.id,
        )
        .filter(
            AdminNotificationRecipient.user_id == user_id,
            AdminNotification.is_published.is_(True),
            or_(
                AdminNotification.publish_at.is_(None),
                AdminNotification.publish_at <= now,
            ),
            or_(
                AdminNotification.expire_at.is_(None),
                AdminNotification.expire_at > now,
            ),
        )
    )


def _notification_item(
    notification: AdminNotification, recipient: AdminNotificationRecipient
) -> NotificationRead:
    return NotificationRead(
        id=notification.id,
        title=notification.title,
        content=notification.content,
        notification_type=notification.notification_type,
        priority=notification.priority,
        publish_at=notification.publish_at,
        is_read=recipient.is_read,
        read_at=recipient.read_at,
    )


@router.get("", response_model=NotificationListResponse)
def list_notifications(
    unread_only: bool = False,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
):
    rows = _visible_notifications(db, current_user.id)
    unread_count = rows.filter(AdminNotificationRecipient.is_read.is_(False)).count()
    query = rows.order_by(AdminNotification.publish_at.desc(), AdminNotification.id.desc())
    if unread_only:
        query = query.filter(AdminNotificationRecipient.is_read.is_(False))
    items = [
        _notification_item(notification, recipient)
        for notification, recipient in query.limit(limit).all()
    ]
    return {"items": items, "unread_count": unread_count}


@router.get("/unread-count", response_model=NotificationUnreadCount)
def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
):
    count = (
        _visible_notifications(db, current_user.id)
        .filter(AdminNotificationRecipient.is_read.is_(False))
        .count()
    )
    return {"unread_count": count}


@router.post("/{notification_id}/read", response_model=NotificationRead)
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
):
    row = (
        db.query(AdminNotification, AdminNotificationRecipient)
        .join(
            AdminNotificationRecipient,
            AdminNotificationRecipient.notification_id == AdminNotification.id,
        )
        .filter(
            AdminNotification.id == notification_id,
            AdminNotificationRecipient.user_id == current_user.id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="通知不存在")
    notification, recipient = row
    if not recipient.is_read:
        recipient.is_read = True
        recipient.read_at = utc_now()
        db.commit()
    return _notification_item(notification, recipient)


@router.post("/read-all", response_model=NotificationUnreadCount)
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
):
    rows = (
        _visible_notifications(db, current_user.id)
        .filter(AdminNotificationRecipient.is_read.is_(False))
        .all()
    )
    for _, recipient in rows:
        recipient.is_read = True
        recipient.read_at = utc_now()
    db.commit()
    return {"unread_count": 0}
