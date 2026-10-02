"""
Account flows: creating an account, signing in, and reading the signed-in account.
Sign-up and sign-in are rate limited; both answer with a token the frontend sends
as `Authorization: Bearer`.

Docs: ./architecture.md
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import User
from app.queries.users import EmailTaken, create_user, find_user_by_email
from app.rate_limit import (
    client_address,
    enforce_rate_limit,
    login_attempt_key,
    login_limiter,
    signup_limiter,
)
from app.schemas import Token, UserCreate, UserOut
from app.security import create_access_token, get_current_user, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

EMAIL_TAKEN = "An account with that email already exists"


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, request: Request, db: Session = Depends(get_db)) -> Token:
    """Create an account and sign it in."""
    # Slow down anyone creating many accounts from one address.
    enforce_rate_limit(signup_limiter, client_address(request), "signup")

    # One account per email.
    if find_user_by_email(db, payload.email) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, EMAIL_TAKEN)

    # Save the account with a hashed password and the default reading speed.
    try:
        user = create_user(
            db,
            email=payload.email,
            hashed_password=hash_password(payload.password),
            preferred_wpm=settings.default_wpm,
        )
    except EmailTaken as exc:
        # The same email signed up at the same moment.
        raise HTTPException(status.HTTP_409_CONFLICT, EMAIL_TAKEN) from exc

    return Token(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.post("/login", response_model=Token)
def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> Token:
    """Sign in with email and password (sent as a form, the OAuth2 password flow)."""
    # Slow down repeated guesses at one account.
    enforce_rate_limit(login_limiter, login_attempt_key(request, form.username), "login")

    # Same answer for an unknown email and a wrong password.
    user = find_user_by_email(db, form.username)
    if user is None or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return Token(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    """The signed-in account."""
    return UserOut.model_validate(user)
