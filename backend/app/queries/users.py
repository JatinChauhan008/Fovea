"""
Database reads and writes for accounts. Emails are stored and looked up in lower case.

- find_user_by_email: the account for an email, or None.
- create_user: a new account. Raises EmailTaken if the email is already registered,
  including when two sign-ups for the same email arrive at once (the unique index on
  users.email decides). Commits.
"""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import User


class EmailTaken(Exception):
    pass


def find_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.lower()))


def create_user(db: Session, *, email: str, hashed_password: str, preferred_wpm: int) -> User:
    user = User(email=email.lower(), hashed_password=hashed_password, preferred_wpm=preferred_wpm)
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise EmailTaken from exc
    db.refresh(user)
    return user
