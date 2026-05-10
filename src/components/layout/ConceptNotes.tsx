import { ChevronDown, Lightbulb, BookOpen, Cpu, Target } from 'lucide-react';
import { useState } from 'react';
import { getLesson } from '../../content/lessons';
import type { ModuleId } from '../../simulation/engine/types';
import { Quiz } from './Quiz';
import { CodeBlock } from './CodeBlock';

interface Props {
  moduleId: ModuleId;
}

type Tier = 'intro' | 'deep' | 'practice' | 'quiz';

const TIER_DEFS: Array<{ key: Tier; label: string; icon: typeof Lightbulb }> = [
  { key: 'intro', label: '初识', icon: Lightbulb },
  { key: 'deep', label: '深入', icon: BookOpen },
  { key: 'practice', label: '上机', icon: Cpu },
  { key: 'quiz', label: '题目', icon: Target },
];

export function ConceptNotes({ moduleId }: Props) {
  const lesson = getLesson(moduleId);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tier>('intro');
  const tiers = TIER_DEFS.filter((t) => {
    if (t.key === 'intro') return !!lesson.introBeginner;
    if (t.key === 'quiz') return !!lesson.quiz?.length;
    return true;
  });
  // 没有初识的旧模块默认开到深入
  const defaultTab: Tier = lesson.introBeginner ? 'intro' : 'deep';
  const activeTab = tiers.find((t) => t.key === tab) ? tab : defaultTab;

  return (
    <section className="rounded-2xl border border-line-subtle bg-bg-surface">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <p className="text-caption uppercase tracking-[0.18em] text-ink-muted">Lesson Notes</p>
          <h2 className="font-display text-title text-ink-primary">教学讲义</h2>
        </div>
        <ChevronDown className={`h-4 w-4 text-ink-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-line-subtle px-4 py-3">
          <div className="mb-3 flex flex-wrap gap-1 rounded-lg border border-line-subtle bg-bg-base p-1">
            {tiers.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`inline-flex items-center gap-1 rounded px-3 py-1.5 text-caption font-medium transition-colors ${
                    activeTab === t.key
                      ? 'bg-accent-primary/15 text-accent-primary'
                      : 'text-ink-secondary hover:text-ink-primary'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />{t.label}
                </button>
              );
            })}
          </div>
          {activeTab === 'intro' && lesson.introBeginner && <IntroPanel intro={lesson.introBeginner} />}
          {activeTab === 'deep' && <DeepPanel lesson={lesson} />}
          {activeTab === 'practice' && <PracticePanel lesson={lesson} />}
          {activeTab === 'quiz' && lesson.quiz && <Quiz items={lesson.quiz} />}
        </div>
      )}
    </section>
  );
}

function IntroPanel({ intro }: { intro: NonNullable<ReturnType<typeof getLesson>['introBeginner']> }) {
  return (
    <div className="space-y-3 text-body leading-relaxed text-ink-secondary">
      <div className="rounded-lg border border-accent-primary/30 bg-accent-primary/[0.06] p-3">
        <p className="mb-1 text-caption font-medium uppercase tracking-[0.18em] text-accent-primary">类比理解</p>
        <p className="text-ink-primary">{intro.metaphor}</p>
      </div>
      <div className="rounded-lg border border-line-subtle bg-bg-base p-3">
        <p className="mb-1 text-caption font-medium uppercase tracking-[0.18em] text-ink-muted">核心一句话</p>
        <p className="text-ink-primary">{intro.coreIdea}</p>
      </div>
      <div>
        <p className="mb-1.5 text-caption uppercase tracking-[0.18em] text-ink-muted">为什么需要学</p>
        <ul className="space-y-1.5">
          {intro.whyCare.map((w) => <li key={w}>· {w}</li>)}
        </ul>
      </div>
      <div className="rounded-lg border border-accent-measure/30 bg-accent-measure/[0.06] p-3">
        <p className="mb-1 text-caption font-medium uppercase tracking-[0.18em] text-accent-measure">现在做这一步</p>
        <p className="text-ink-primary">{intro.firstAction}</p>
      </div>
    </div>
  );
}

function DeepPanel({ lesson }: { lesson: ReturnType<typeof getLesson> }) {
  return (
    <div className="space-y-4 text-body leading-relaxed text-ink-secondary">
      <Section title="学习目标">
        <ul className="space-y-1.5">
          {lesson.learningGoals.map((g) => <li key={g}>· {g}</li>)}
        </ul>
      </Section>
      <Section title="核心概念">
        <ul className="space-y-1.5">
          {lesson.concepts.map((c) => <li key={c}>· {c}</li>)}
        </ul>
      </Section>
      <Section title="数学公式">
        <div className="space-y-2">
          {lesson.formulas.map((f) => (
            <div key={f.title} className="rounded-lg border border-line-subtle bg-bg-base p-3">
              <p className="mb-1 text-body font-medium text-ink-primary">{f.title}</p>
              <p className="formula mb-1.5 text-accent-primary">{f.expression}</p>
              <p className="text-caption text-ink-secondary">{f.explanation}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section title="工程意义">
        <ul className="space-y-1.5">
          {lesson.engineeringMeaning.map((m) => <li key={m}>· {m}</li>)}
        </ul>
      </Section>
      <Section title="常见错误 / 调试">
        <div className="grid gap-3 md:grid-cols-2">
          <ul className="space-y-1.5">
            {lesson.commonMistakes.map((m) => <li key={m} className="text-accent-fault/90">· {m}</li>)}
          </ul>
          <ul className="space-y-1.5">
            {lesson.debugMethods.map((m) => <li key={m} className="text-accent-measure/90">· {m}</li>)}
          </ul>
        </div>
      </Section>
      <Section title="本节总结">
        <p>{lesson.summary}</p>
      </Section>
    </div>
  );
}

function PracticePanel({ lesson }: { lesson: ReturnType<typeof getLesson> }) {
  return (
    <div className="space-y-4 text-body leading-relaxed text-ink-secondary">
      <Section title="STM32 / C 实战要点">
        <ul className="space-y-1.5">
          {lesson.stm32Guide.map((g) => <li key={g}>· {g}</li>)}
        </ul>
      </Section>
      <Section title="代码骨架">
        <CodeBlock code={lesson.codeExample} title={`${lesson.id}.c — 移植起点`} />
      </Section>
      <Section title="实验建议">
        <ul className="space-y-1.5">
          {lesson.experiments.map((e) => <li key={e}>· {e}</li>)}
        </ul>
      </Section>
      <Section title="下一步">
        <ul className="space-y-1.5">
          {lesson.nextSteps.map((n) => <li key={n}>→ {n}</li>)}
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-caption uppercase tracking-[0.18em] text-ink-muted">{title}</p>
      {children}
    </div>
  );
}
