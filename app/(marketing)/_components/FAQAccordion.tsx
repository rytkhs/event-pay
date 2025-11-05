"use client";

import { useState } from "react";

export type FAQItem = {
  question: string;
  answer: string;
};

interface FAQAccordionProps {
  items: FAQItem[];
}

export function FAQAccordion({ items }: FAQAccordionProps): JSX.Element {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  return (
    <div className="faq-list">
      {items.map((item, idx) => {
        const isActive = openFaqIndex === idx;
        return (
          <div key={item.question} className={`faq-item${isActive ? " active" : ""}`}>
            <button
              className="faq-question"
              onClick={() => setOpenFaqIndex(isActive ? null : idx)}
              aria-expanded={isActive}
            >
              <span>{item.question}</span>
              <span className="faq-icon">+</span>
            </button>
            <div className="faq-answer" aria-hidden={!isActive}>
              <p>{item.answer}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
