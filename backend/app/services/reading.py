"""
The rules for a reader's place and their logged reading, with no database access.

- clamp_position: keeps a saved word and page inside the document.
- words_in_stretch: how many words a logged stretch covered, never counting past the
  end of the document or backwards.
- progress_out: the place as the API returns it, with percent through and whether the
  document counts as finished (COMPLETION_THRESHOLD, the same rule the Stats page uses).
- document_with_progress: a document plus the reader's place in it, for the library.
"""

from app.models import Document, Progress
from app.schemas import DocumentWithProgress, ProgressOut
from app.services.analytics import COMPLETION_THRESHOLD


def clamp_position(word_index: int, page: int, document: Document) -> tuple[int, int]:
    last_word = max(document.word_count - 1, 0)
    last_page = max(document.page_count, 1)
    return min(max(word_index, 0), last_word), min(max(page, 1), last_page)


def words_in_stretch(start_index: int, end_index: int, word_count: int) -> int:
    return max(min(end_index, word_count) - start_index, 0)


def progress_out(progress: Progress | None, word_count: int) -> ProgressOut | None:
    if progress is None:
        return None
    fraction = min(progress.word_index / word_count, 1.0) if word_count else 0.0
    return ProgressOut(
        document_id=progress.document_id,
        word_index=progress.word_index,
        page=progress.page,
        wpm=progress.wpm,
        updated_at=progress.updated_at,
        percent_complete=round(fraction * 100, 2),
        finished=fraction >= COMPLETION_THRESHOLD,
    )


def document_with_progress(document: Document, progress: Progress | None) -> DocumentWithProgress:
    item = DocumentWithProgress.model_validate(document)
    item.progress = progress_out(progress, document.word_count)
    return item
