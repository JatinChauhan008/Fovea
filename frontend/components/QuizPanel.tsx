"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Quiz, QuizResult } from "@/lib/types";

interface Props {
  documentId: number;
  startIndex: number;
  endIndex: number;
  wpm: number;
  onClose: () => void;
  onApplyWpm: (wpm: number) => void;
}

export function QuizPanel({
  documentId,
  startIndex,
  endIndex,
  wpm,
  onClose,
  onApplyWpm,
}: Props) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api
      .createQuiz({
        document_id: documentId,
        start_index: startIndex,
        end_index: endIndex,
        wpm,
        num_questions: 4,
      })
      .then((created) => {
        if (cancelled) return;
        setQuiz(created);
        setAnswers(new Array(created.questions.length).fill(-1));
      })
      .catch((err) => !cancelled && setError(err.message));

    return () => {
      cancelled = true;
    };
  }, [documentId, startIndex, endIndex, wpm]);

  const submit = async () => {
    if (!quiz) return;
    setSubmitting(true);
    try {
      setResult(await api.submitQuiz(quiz.id, answers));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const ready = answers.length > 0 && answers.every((value) => value >= 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/85 p-4 backdrop-blur-sm sm:p-8">
      <div className="w-full max-w-2xl rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Comprehension check</h2>
            <p className="mt-1 text-sm text-muted">
              {(endIndex - startIndex).toLocaleString()} words at {wpm} WPM
              {quiz?.source === "heuristic" && " · generated locally"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-md px-2 py-1 text-muted hover:text-text"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-orp/40 bg-orp/10 p-4 text-sm text-orp">
            {error}
          </div>
        )}

        {!quiz && !error && (
          <div className="py-10 text-center text-muted">Writing questions&hellip;</div>
        )}

        {quiz && !result && (
          <div className="space-y-6">
            {quiz.questions.map((question, questionIndex) => (
              <fieldset key={questionIndex} className="space-y-2">
                <legend className="mb-2 font-medium">
                  {questionIndex + 1}. {question.question}
                </legend>
                {question.options.map((option, optionIndex) => (
                  <label
                    key={optionIndex}
                    className={`focus-ring flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                      answers[questionIndex] === optionIndex
                        ? "border-brand/60 bg-brand/10"
                        : "border-line hover:border-line hover:bg-raised"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`question-${questionIndex}`}
                      checked={answers[questionIndex] === optionIndex}
                      onChange={() =>
                        setAnswers((current) =>
                          current.map((value, i) =>
                            i === questionIndex ? optionIndex : value,
                          ),
                        )
                      }
                      className="accent-brand"
                    />
                    {option}
                  </label>
                ))}
              </fieldset>
            ))}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="focus-ring rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-text"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!ready || submitting}
                className="focus-ring rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? "Scoring…" : "Submit"}
              </button>
            </div>
          </div>
        )}

        {quiz && result && (
          <div className="space-y-5">
            <div className="rounded-xl border border-line bg-raised p-5 text-center">
              <p className="text-4xl font-semibold tabular-nums">
                {Math.round(result.score * 100)}%
              </p>
              <p className="mt-1 text-sm text-muted">
                {result.correct} of {result.total} correct at {wpm} WPM
              </p>
            </div>

            <div className="space-y-3">
              {quiz.questions.map((question, questionIndex) => {
                const correctIndex = result.answer_key[questionIndex];
                const given = answers[questionIndex];
                const right = given === correctIndex;
                return (
                  <div
                    key={questionIndex}
                    className={`rounded-lg border p-3 text-sm ${
                      right ? "border-brand/40 bg-brand/5" : "border-orp/40 bg-orp/5"
                    }`}
                  >
                    <p className="font-medium">{question.question}</p>
                    <p className="mt-1 text-muted">
                      {right ? "Correct" : `You chose "${question.options[given]}"`} &middot;
                      answer: {question.options[correctIndex]}
                    </p>
                    {result.explanations[questionIndex] && (
                      <p className="mt-1 text-xs text-muted/80">
                        {result.explanations[questionIndex]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl border border-line bg-raised p-5">
              <p className="text-sm font-medium">
                Recommended speed: {result.recommendation.recommended_wpm} WPM
              </p>
              <p className="mt-1 text-sm text-muted">{result.recommendation.rationale}</p>
              <div className="mt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="focus-ring rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-text"
                >
                  Keep {wpm}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApplyWpm(result.recommendation.recommended_wpm);
                    onClose();
                  }}
                  className="focus-ring rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-ink"
                >
                  Use {result.recommendation.recommended_wpm} WPM
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
