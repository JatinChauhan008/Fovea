/** Speed presets offered in the reader. */
export const WPM_PRESETS = [200, 300, 400, 500, 700] as const;

export const DEFAULT_WPM = 300;

/** Save the reader's position at most this often while playing. */
export const PROGRESS_SAVE_INTERVAL_MS = 5000;

/** A comprehension check needs at least this much material to ask about. */
export const MIN_QUIZ_WORDS = 60;

/** Words fetched per request when streaming a long document in. */
export const CONTENT_CHUNK = 20000;
