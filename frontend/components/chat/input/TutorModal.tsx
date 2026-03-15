"use client";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Send, Sparkles } from "lucide-react";

interface TutorModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isRefining: boolean;
  originalPrompt: string;
  improvedPrompt: string;
  clarifyingQuestions: string[];
  onSendOriginal: () => void;
  onSendImproved: () => void;
  onCancel: () => void;
}

export function TutorModal({
  open, onOpenChange, isRefining,
  originalPrompt, improvedPrompt, clarifyingQuestions,
  onSendOriginal, onSendImproved, onCancel,
}: TutorModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} onCancel={onCancel}>
      <DialogContent className="max-w-[540px]">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-700/[0.12] border border-blue-700/20">
              <Sparkles size={17} strokeWidth={2} className="text-blue-700" />
            </div>
            <div>
              <DialogTitle>Enhance your prompt</DialogTitle>
              <DialogDescription>AI tutor is helping you make your prompt more precise.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="px-5 py-4 space-y-4">
          {isRefining ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="flex items-center gap-2">
                {[0, 150, 300].map((d) => (
                  <span
                    key={d}
                    className="h-2 w-2 rounded-full bg-blue-700"
                    style={{ animation: `pulse-dot 1.2s ${d}ms infinite` }}
                  />
                ))}
              </div>
              <p className="text-[15px] text-ds-text-secondary">Analyzing prompt…</p>
            </div>
          ) : (
            <>
              {clarifyingQuestions.length > 0 && (
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider font-mono text-ds-text-tertiary">
                    Clarifications for a better response
                  </p>
                  <ul className="space-y-2">
                    {clarifyingQuestions.map((q, i) => (
                      <li key={i} className="flex items-start gap-3 rounded-xl px-4 py-3 bg-background border border-gray-alpha-200">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold font-mono bg-gray-alpha-200 text-ds-text-secondary">
                          {i + 1}
                        </span>
                        <span className="text-[15px] leading-relaxed text-ds-text">{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {improvedPrompt && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider font-mono text-ds-text-tertiary">
                    Improved prompt
                  </p>
                  <div className="relative rounded-xl px-4 py-3.5 bg-gray-alpha-100 border border-gray-alpha-200">
                    <div className="absolute left-0 top-0 h-full w-0.5 rounded-l-xl bg-blue-700/50" />
                    <p className="pl-2 text-[15px] leading-relaxed text-ds-text">{improvedPrompt}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        {!isRefining && (
          <DialogFooter>
            <div className="flex items-center justify-between gap-2">
              <Button variant="secondary" onClick={onCancel}>Cancel</Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={onSendOriginal}>Send Original</Button>
                <Button variant="default" onClick={onSendImproved} disabled={!improvedPrompt} leftIcon={<Send size={14} strokeWidth={2} />}>
                  Send Improved
                </Button>
              </div>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}