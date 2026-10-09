import React from 'react';

/**
 * Section kicker: numbered ops label above each feed block.
 * "01 — LINGKUNGAN SEKITAR" reads like a bulletin agenda, not a template heading.
 */
export function SectionKicker({ number, title, hint }) {
  return (
    <div className="section-kicker">
      <span className="section-kicker-num mono-num" aria-hidden="true">{number}</span>
      <div>
        <h2 className="section-kicker-title">{title}</h2>
        {hint && <p className="section-kicker-hint">{hint}</p>}
      </div>
    </div>
  );
}
