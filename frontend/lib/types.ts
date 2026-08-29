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
  summary: string | null;
  summary_source: string | null;
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

export interface Recommendation {
  recommended_wpm: number;
  current_wpm: number;
  confidence: "none" | "low" | "medium" | "high";
  rationale: string;
  samples: number;
  average_comprehension: number | null;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answer_index: number;
  explanation: string | null;
}

export interface Quiz {
  id: number;
  document_id: number;
  source: "ai" | "heuristic";
  questions: QuizQuestion[];
}

export interface QuizResult {
  quiz_id: number;
  score: number;
  correct: number;
  total: number;
  answer_key: number[];
  explanations: (string | null)[];
  recommendation: Recommendation;
}

export interface SpeedPoint {
  date: string;
  wpm: number;
  comprehension: number | null;
  words: number;
}

export interface Analytics {
  documents_total: number;
  documents_completed: number;
  words_read: number;
  minutes_read: number;
  average_wpm: number;
  best_wpm: number;
  average_comprehension: number | null;
  current_streak_days: number;
  trend: SpeedPoint[];
}

export interface Summary {
  document_id: number;
  summary: string;
  source: string;
}

export interface AiStatus {
  provider: string;
  model: string;
  enabled: boolean;
  fallback: string;
}
