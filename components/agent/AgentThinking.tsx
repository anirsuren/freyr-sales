"use client";

import { useEffect, useState } from "react";

const THINKING_WORDS = [
  "Thinking",
  "Percolating",
  "Noodling",
  "Cogitating",
  "Scheming",
  "Bamboozling",
  "Conjuring",
  "Crunching",
  "Pondering",
  "Vibing",
];

export function AgentThinking() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((current) => (current + 1) % THINKING_WORDS.length), 1600);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="flex items-center gap-2.5" role="status" aria-label="Thinking">
      <span className="flex items-end gap-1 h-4" aria-hidden="true">
        <span className="eq-bar" style={{ animationDelay: "0ms" }} />
        <span className="eq-bar" style={{ animationDelay: "150ms" }} />
        <span className="eq-bar" style={{ animationDelay: "300ms" }} />
      </span>
      <span className="text-[12.5px] italic text-text-tertiary" aria-hidden="true">
        {THINKING_WORDS[index]}…
      </span>
    </span>
  );
}
