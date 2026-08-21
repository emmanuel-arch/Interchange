"""
GoldStrike v2.0 — Session Filter
Trading hours enforcement in East Africa Time (EAT / UTC+3).
"""

from datetime import datetime, timezone, timedelta
import config

EAT = timezone(timedelta(hours=3))


def now_eat() -> datetime:
    """Current time in East Africa Time."""
    return datetime.now(EAT)


def _ensure_eat(t: datetime) -> datetime:
    """Normalize to East Africa Time (naive datetimes are treated as EAT)."""
    if t.tzinfo is None:
        return t.replace(tzinfo=EAT)
    return t.astimezone(EAT)


def get_current_session_at(t: datetime) -> str:
    """
    Session name at instant ``t`` (LONDON, NY_OVERLAP, NY, or OFF).
    ``t`` may be any tz-aware time; it is converted to EAT.
    """
    t = _ensure_eat(t)
    hour = t.hour

    if config.LONDON_START <= hour < config.LONDON_END:
        return 'LONDON'
    if config.NY_OVERLAP_START <= hour < config.NY_OVERLAP_END:
        return 'NY_OVERLAP'
    if config.NY_CONT_START <= hour < config.NY_CONT_END:
        return 'NY'
    return 'OFF'


def get_current_session() -> str:
    """
    Returns the current trading session name.
    LONDON, NY_OVERLAP, NY, or OFF.
    """
    return get_current_session_at(now_eat())


def is_trading_session_at(t: datetime) -> bool:
    """True if ``t`` falls inside a valid trading window (EAT clock)."""
    return get_current_session_at(t) != 'OFF'


def is_trading_session() -> bool:
    """True if we are inside a valid trading window."""
    return get_current_session() != 'OFF'


def is_friday_cutoff_at(t: datetime) -> bool:
    """True if ``t`` (EAT) is Friday past the cutoff hour — close all positions."""
    t = _ensure_eat(t)
    return t.weekday() == 4 and t.hour >= config.FRIDAY_CUTOFF_HOUR


def is_friday_cutoff() -> bool:
    """True if it's Friday past the cutoff hour — close all positions."""
    return is_friday_cutoff_at(now_eat())


def is_weekend_at(t: datetime) -> bool:
    """True on Saturday (5) or Sunday (6) in EAT."""
    return _ensure_eat(t).weekday() >= 5


def is_weekend() -> bool:
    """True on Saturday (5) or Sunday (6)."""
    return is_weekend_at(now_eat())


def is_monday_caution_at(t: datetime) -> bool:
    """Monday London first 2 hours at instant ``t`` (EAT)."""
    t = _ensure_eat(t)
    return t.weekday() == 0 and config.LONDON_START <= t.hour < config.LONDON_START + 2


def is_monday_caution() -> bool:
    """True during the first 2 hours of Monday London session (reduce lots)."""
    return is_monday_caution_at(now_eat())


def session_status() -> str:
    """Human-readable session status for logging."""
    t = now_eat()
    session = get_current_session()
    return f"{session} | {t.strftime('%A %H:%M EAT')}"
