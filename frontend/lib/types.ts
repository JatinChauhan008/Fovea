export interface User {
  id: number;
  email: string;
  preferred_wpm: number;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Progress {
  document_id: number;
  word_index: number;
  page: number;
  wpm: number;
  updated_at: string;
  percent_complete: number;
}

export interface Doc {
  id: number;
  title: string;
  original_filename: string;
  page_count: number;
  word_count: number;
  status: string;
  error: string | null;
  created_at: string;
  progress?: Progress | null;
}

/** One word, ready to render: text, ORP index, delay multiplier, page. */
export interface WordToken {
  t: string;
  o: number;
  m: number;
  p: number;
}

export interface Content {
  document_id: number;
  start: number;
  count: number;
  total: number;
  page_count: number;
  tokens: WordToken[];
}

export interface SpeedPoint {
  date: string;
  wpm: number;
  words: number;
}

export interface Analytics {
  documents_total: number;
  documents_completed: number;
  words_read: number;
  minutes_read: number;
  average_wpm: number;
  best_wpm: number;
  current_streak_days: number;
  trend: SpeedPoint[];
}
