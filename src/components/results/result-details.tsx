"use client";

import { motion } from "framer-motion";
import { Download, RotateCcw, Share2 } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  moodName: string;
  explanation: string;
  notice: string | null;
  onDownload: () => void;
  onShare: () => void;
  onStartAgain: () => void;
};

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex size-11 items-center justify-center rounded-full bg-paper text-ink transition-[background-color,transform] duration-200 ease-out hover:bg-paper-2 active:scale-[0.96]"
    >
      {children}
    </button>
  );
}

/** Sits directly under the comparison, so the result's actions and explanation are seen with it. */
export function ResultDetails({ moodName, explanation, notice, onDownload, onShare, onStartAgain }: Props) {
  return (
    <motion.section
      aria-labelledby="result-title"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.07 }}
      className="px-1 pb-1 pt-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="result-title" className="min-w-0 text-lead">
          {moodName}
        </h2>
        <div role="group" aria-label="Result actions" className="flex shrink-0 gap-1.5">
          <IconAction label="Download" onClick={onDownload}>
            <Download className="size-5" strokeWidth={1.5} aria-hidden="true" />
          </IconAction>
          <IconAction label="Share" onClick={onShare}>
            <Share2 className="size-5" strokeWidth={1.5} aria-hidden="true" />
          </IconAction>
          <IconAction label="Start again" onClick={onStartAgain}>
            <RotateCcw className="size-5" strokeWidth={1.5} aria-hidden="true" />
          </IconAction>
        </div>
      </div>
      {notice && (
        <p role="status" className="mt-2 text-small text-ink-2">
          {notice}
        </p>
      )}
      <p className="mt-2 max-w-[65ch] text-body">{explanation}</p>
      <p className="mt-2 text-small text-ink-2">A generative interpretation: details may differ from your original.</p>
    </motion.section>
  );
}
