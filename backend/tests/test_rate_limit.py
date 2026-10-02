"""Sign-in and sign-up rate limits: the limiter itself, then the endpoints using it."""

from app.rate_limit import RateLimiter


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_allows_up_to_the_limit_then_says_how_long_to_wait():
    clock = FakeClock()
    limiter = RateLimiter(limit=3, window_seconds=60, clock=clock)

    assert [limiter.hit("k") for _ in range(3)] == [None, None, None]
    clock.now += 10
    assert limiter.hit("k") == 50


def test_attempts_age_out_of_the_window():
    clock = FakeClock()
    limiter = RateLimiter(limit=1, window_seconds=60, clock=clock)

    assert limiter.hit("k") is None
    clock.now += 61
    assert limiter.hit("k") is None


def test_keys_are_counted_separately():
    limiter = RateLimiter(limit=1, window_seconds=60, clock=FakeClock())

    assert limiter.hit("a") is None
    assert limiter.hit("b") is None
    assert limiter.hit("a") is not None


def test_repeated_wrong_passwords_are_slowed_down(client):
    client.post("/auth/register", json={"email": "guess@example.com", "password": "right-password"})
    wrong = {"username": "guess@example.com", "password": "wrong-password"}

    statuses = [client.post("/auth/login", data=wrong).status_code for _ in range(11)]

    assert statuses[:10] == [401] * 10
    assert statuses[10] == 429
    blocked = client.post("/auth/login", data=wrong)
    assert int(blocked.headers["Retry-After"]) > 0
    # Another account from the same address is not locked out by someone else's guessing.
    other = client.post(
        "/auth/login", data={"username": "someone@example.com", "password": "whatever-pass"}
    )
    assert other.status_code == 401


def test_sign_ups_from_one_address_are_limited(client):
    statuses = [
        client.post(
            "/auth/register", json={"email": f"bulk{n}@example.com", "password": "a-good-password"}
        ).status_code
        for n in range(11)
    ]

    assert statuses[:10] == [201] * 10
    assert statuses[10] == 429
