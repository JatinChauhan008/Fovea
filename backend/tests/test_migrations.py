"""Database migrations: new databases, databases from older versions, and model drift."""

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect, text

from app.db import BASELINE_REVISION, Base, migrate_database


def _url(tmp_path) -> str:
    return f"sqlite:///{tmp_path / 'fovea.db'}"


def _version(url: str) -> str:
    with create_engine(url).connect() as conn:
        return conn.execute(text("select version_num from alembic_version")).scalar_one()


def test_a_new_database_gets_every_table_and_matches_the_models(tmp_path):
    url = _url(tmp_path)

    migrate_database(url)

    engine = create_engine(url)
    tables = set(inspect(engine).get_table_names())
    assert {"users", "documents", "progress", "reading_sessions"} <= tables
    with engine.connect() as conn:
        drift = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    assert drift == []


def test_a_database_from_an_older_version_keeps_its_data_and_is_brought_up_to_date(tmp_path):
    url = _url(tmp_path)
    # What older versions left behind: the baseline tables, no migration history.
    migrate_database(url, target=BASELINE_REVISION)
    engine = create_engine(url)
    with engine.begin() as conn:
        conn.execute(text("drop table alembic_version"))
        conn.execute(
            text(
                "insert into users (email, hashed_password, preferred_wpm, created_at)"
                " values ('old@example.com', 'x', 300, '2026-01-01')"
            )
        )

    migrate_database(url)

    with engine.connect() as conn:
        assert conn.execute(text("select email from users")).scalar_one() == "old@example.com"
    indexes = {i["name"] for i in inspect(engine).get_indexes("reading_sessions")}
    assert "ix_reading_sessions_user_created" in indexes
    assert _version(url) != BASELINE_REVISION


def test_running_migrations_twice_changes_nothing(tmp_path):
    url = _url(tmp_path)
    migrate_database(url)
    first = _version(url)

    migrate_database(url)

    assert _version(url) == first
