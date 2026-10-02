"""
The database engine, the request-scoped session, and bringing the schema up to date.

`migrate_database` runs the Alembic migrations in backend/migrations at startup. A
database made by a version from before migrations existed has the tables but no
migration history; it is first marked as being at BASELINE_REVISION (which creates
exactly those tables) so only the later migrations run against it.
"""

from collections.abc import Generator

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import BASE_DIR, get_settings

settings = get_settings()

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

BASELINE_REVISION = "0001"


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def migrate_database(database_url: str | None = None, target: str = "head") -> None:
    url = database_url or settings.database_url
    config = Config(str(BASE_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BASE_DIR / "migrations"))
    # The ini parser treats "%" as special, so escape it in the URL.
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))

    probe = create_engine(url)
    try:
        tables = set(inspect(probe).get_table_names())
    finally:
        probe.dispose()
    if "users" in tables and "alembic_version" not in tables:
        command.stamp(config, BASELINE_REVISION)

    command.upgrade(config, target)
