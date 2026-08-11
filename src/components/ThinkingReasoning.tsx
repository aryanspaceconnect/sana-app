import styles from "./ThinkingReasoning.module.css";
import { useEffect, useRef, useState } from "react";

const DEFAULT_SENTENCES = [
  "Reading the request and analyzing skin profile & query context.",
  "Cross-referencing active ingredients with clinical safety & sensitivity guidelines.",
  "Checking user Memory Vault for recorded skin incidents, goals, or routine preferences.",
  "Formulating personalized clinical skincare advice and step-by-step guidance.",
  "Verifying safety compatibility and potential ingredient contraindications.",
  "Synthesizing final response with tailored skincare recommendations.",
];

// Per-sentence reveal cadence (ms). Sums to ~5s of "thinking".
const DELAYS = [700, 900, 800, 850, 800, 900];
const THINK_MS = DELAYS.reduce((a, b) => a + b, 0);
const ELAPSED_S = Math.max(1, Math.round(THINK_MS / 1000));
const COLLAPSE_BEAT = 360;

// Geometry — keep in sync with the CSS below.
const SENT_H = 40; // 2 lines × 20px
const GAP = 4;
const MAX_H = 180; // viewport grows with content up to this, then scrolls
const FADE = 16; // top/bottom fade once the viewport is capped

export interface ThinkingReasoningProps {
  customSentences?: string[];
  isStreaming?: boolean;
}

export function ThinkingReasoning({ customSentences, isStreaming = false }: ThinkingReasoningProps) {
  const SENTENCES = customSentences && customSentences.length > 0 ? customSentences : DEFAULT_SENTENCES;
  
  // "thinking" | "done"
  const [phase, setPhase] = useState("thinking");
  const [revealed, setRevealed] = useState(0);
  const [open, setOpen] = useState(false);
  const [fade, setFade] = useState({ top: false, bottom: true });
  const viewportRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(1);

  // Track elapsed thinking duration
  useEffect(() => {
    if (phase === "done") return;
    const interval = setInterval(() => {
      setElapsed(Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000)));
    }, 500);
    return () => clearInterval(interval);
  }, [phase]);

  // Sequentially reveal sentences as they are provided
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setRevealed(SENTENCES.length);
      if (!isStreaming) setPhase("done");
      return;
    }

    let isMounted = true;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Step through each unrevealed sentence with smooth staggered delays
    const stepDelay = 650; 
    
    let currentCount = revealed;
    if (currentCount >= SENTENCES.length && !isStreaming) {
      const timer = setTimeout(() => {
        if (isMounted) setPhase("done");
      }, COLLAPSE_BEAT);
      timers.push(timer);
    } else {
      let cumulative = 0;
      for (let i = currentCount; i < SENTENCES.length; i++) {
        cumulative += DELAYS[i % DELAYS.length] || stepDelay;
        const targetIdx = i + 1;
        const t = setTimeout(() => {
          if (isMounted) {
            setRevealed(targetIdx);
            if (targetIdx === SENTENCES.length && !isStreaming) {
              setTimeout(() => {
                if (isMounted) setPhase("done");
              }, COLLAPSE_BEAT);
            }
          }
        }, cumulative);
        timers.push(t);
      }
    }

    return () => {
      isMounted = false;
      timers.forEach(clearTimeout);
    };
  }, [SENTENCES, isStreaming]);

  const done = phase === "done";
  const expanded = done ? open : true;
  const count = done ? SENTENCES.length : revealed;
  const contentH = count > 0 ? count * SENT_H + (count - 1) * GAP : 0;
  const capped = contentH > MAX_H;
  const viewH = capped ? MAX_H : contentH;
  const scrollable = done && open;
  const translate = scrollable ? 0 : capped ? MAX_H - FADE - contentH : 0;

  const showTop = scrollable ? fade.top : capped;
  const showBottom = scrollable ? fade.bottom : capped;
  const mask = capped
    ? `linear-gradient(to bottom, transparent 0, #000 ${showTop ? FADE : 0}px, #000 calc(100% - ${showBottom ? FADE : 0}px), transparent 100%)`
    : "none";

  const onScroll = () => {
    const el = viewportRef.current;
    if (!el) return;
    setFade({
      top: el.scrollTop > 1,
      bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
    });
  };

  const toggle = () => {
    const next = !open;
    if (next) {
      setFade({ top: false, bottom: true });
      if (viewportRef.current) viewportRef.current.scrollTop = 0;
    }
    setOpen(next);
  };

  return (
    <div className={styles.tr}>
      <button
        type="button"
        className={styles.trHeader + (done ? " " + styles.isClickable : "")}
        aria-expanded={expanded}
        aria-label="Toggle thought"
        onClick={done ? toggle : undefined}
      >
        {done ? (
          <span className={styles.trLabel}>
            <span className={styles.trVerb}>Thought</span> for {elapsed}s
          </span>
        ) : (
          <span className={styles.trLabel + " " + styles.trShimmer}>Thinking…</span>
        )}
        {done && (
          <svg
            className={styles.trChevron}
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
            viewBox="0 0 24 24"
            width="12"
            height="12"
            aria-hidden="true"
          >
            <path
              d="m4.5 15.75 7.5-7.5 7.5 7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      <div className={styles.trCollapsible + (expanded ? "" : " " + styles.isCollapsed)}>
        <div className={styles.trInner}>
          <div
            ref={viewportRef}
            className={styles.trViewport + (scrollable ? " " + styles.isScroll : "")}
            style={{ height: `${viewH}px`, WebkitMaskImage: mask, maskImage: mask }}
            onScroll={scrollable ? onScroll : undefined}
          >
            <div className={styles.trStream} style={{ transform: `translateY(${translate}px)` }}>
              {SENTENCES.slice(0, count).map((line, i) => (
                <p key={i} className={styles.trSentence}>{line}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
