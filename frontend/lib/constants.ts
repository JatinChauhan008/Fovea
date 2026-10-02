/*
 * Reading limits and defaults. The speed values mirror the backend's settings
 * (DEFAULT_WPM, MIN_WPM, MAX_WPM in backend/app/config.py), which also validate
 * every saved speed; change both together.
 */

/** Speed presets offered in the reader. */
export const WPM_PRESETS = [200, 300, 400, 500, 700] as const;

export const DEFAULT_WPM = 250;
export const MIN_WPM = 100;
export const MAX_WPM = 900;

/** How much the arrow keys and the slider change the speed by. */
export const WPM_STEP = 25;

/** Save the reader's position at most this often while playing. */
export const PROGRESS_SAVE_INTERVAL_MS = 5000;

/** Words fetched per request when streaming a long document in. */
export const CONTENT_CHUNK = 20000;

/** Mirrors the backend's max_upload_mb, so oversized files fail before uploading. */
export const MAX_UPLOAD_MB = 40;
