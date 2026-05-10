import { CheckCircle2, HelpCircle, RefreshCw, XCircle } from 'lucide-react';
import { useState } from 'react';

interface QuizItem {
  q: string;
  options: string[];
  correct: number;
  hint: string;
}

interface Props {
  items: QuizItem[];
}

type AnswerState = 'unanswered' | 'correct' | 'wrong';

export function Quiz({ items }: Props) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [reveal, setReveal] = useState<Record<number, boolean>>({});

  const reset = () => {
    setAnswers({});
    setReveal({});
  };

  const correctCount = items.reduce((acc, item, i) => {
    return acc + (answers[i] === item.correct ? 1 : 0);
  }, 0);
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border border-line-subtle bg-bg-base px-3 py-2">
        <span className="text-body text-ink-secondary">
          已答 {answeredCount} / {items.length} · 正确 <span className="text-accent-measure">{correctCount}</span>
        </span>
        <button onClick={reset} className="inline-flex items-center gap-1 rounded border border-line-subtle px-2 py-1 text-caption text-ink-muted transition-colors hover:text-ink-primary">
          <RefreshCw className="h-3 w-3" />重做
        </button>
      </div>
      {items.map((item, i) => {
        const userPick = answers[i];
        const state: AnswerState = userPick === undefined
          ? 'unanswered'
          : userPick === item.correct ? 'correct' : 'wrong';
        const isRevealed = reveal[i];
        return (
          <div key={i} className="rounded-lg border border-line-subtle bg-bg-base p-3">
            <p className="mb-2 text-body font-medium text-ink-primary">
              <span className="mr-1.5 text-ink-muted">{i + 1}.</span>{item.q}
            </p>
            <div className="space-y-1.5">
              {item.options.map((opt, j) => {
                const picked = userPick === j;
                const showRight = state !== 'unanswered' && j === item.correct;
                const showWrong = state === 'wrong' && picked;
                return (
                  <button
                    key={j}
                    onClick={() => setAnswers((prev) => ({ ...prev, [i]: j }))}
                    className={`flex w-full items-center gap-2 rounded border px-2.5 py-1.5 text-left text-body transition-colors ${
                      showRight
                        ? 'border-accent-measure/50 bg-accent-measure/10 text-accent-measure'
                        : showWrong
                          ? 'border-accent-fault/50 bg-accent-fault/10 text-accent-fault'
                          : picked
                            ? 'border-accent-primary/50 bg-accent-primary/10 text-accent-primary'
                            : 'border-line-subtle text-ink-secondary hover:border-line-strong hover:text-ink-primary'
                    }`}
                  >
                    {showRight && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                    {showWrong && <XCircle className="h-4 w-4 shrink-0" />}
                    {!showRight && !showWrong && (
                      <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                        picked ? 'border-accent-primary' : 'border-line-strong'
                      }`}>
                        {picked && <span className="h-1.5 w-1.5 rounded-full bg-accent-primary" />}
                      </span>
                    )}
                    <span className="text-caption text-ink-muted">{String.fromCharCode(65 + j)}.</span>
                    <span className="flex-1">{opt}</span>
                  </button>
                );
              })}
            </div>
            {state === 'wrong' && !isRevealed && (
              <button
                onClick={() => setReveal((prev) => ({ ...prev, [i]: true }))}
                className="mt-2 inline-flex items-center gap-1 text-caption text-accent-warn hover:underline"
              >
                <HelpCircle className="h-3 w-3" />看提示
              </button>
            )}
            {((state === 'wrong' && isRevealed) || state === 'correct') && (
              <p className="mt-2 rounded border border-line-subtle bg-bg-surface p-2 text-caption leading-relaxed text-ink-secondary">
                <span className="text-ink-primary">提示：</span>{item.hint}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
