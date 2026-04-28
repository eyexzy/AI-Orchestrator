"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { Wand2 } from "lucide-react";
import { useUserLevelStore } from "@/lib/store/userLevelStore";
import { useChatStore } from "@/lib/store/chatStore";
import { useDraftStore, getDraftEntry } from "@/lib/store/draftStore";
import { ChatInputBox } from "@/components/chat/ChatInputBox";
import type { AttachmentChipData } from "@/components/ui/attachment-chip";
import { FilePreviewModal } from "@/components/ui/file-preview-modal";
import { actionToast } from "@/components/ui/action-toast";
import { extractVarNames } from "@/components/chat/extractVarNames";
import { REQUEST_TIMEOUT_MS } from "@/lib/config";
import { resolveVariables } from "@/lib/api";
import { readResponseError } from "@/lib/request";
import { TutorModal, TutorReview, TutorMode } from "./input/TutorModal";
import { L1Chips } from "./input/L1Chips";
import { L3StrategyChips } from "./input/L3StrategyChips";
import { useTranslation } from "@/lib/store/i18nStore";
import { Tooltip } from "@/components/ui/tooltip";
import { flushEvents, trackEvent } from "@/lib/eventTracker";
import { useMicroFeedbackStore } from "@/lib/store/microFeedbackStore";

const ENHANCE_MIN_CHARS = 9;

/* ─── Limits ─────────────────────────────────────────────────────────────── */
const MAX_FILES = 10;
const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const MIN_WORDS = 5;
const VARIABLE_SYNC_DEBOUNCE_MS = 120;
const GENERIC_TUTOR_ERRORS = new Set([
  "Backend unreachable", "Request failed", "Invalid JSON",
  "Failed to refine prompt", "invalid_request_json",
  "tutor_review_unavailable", "tutor_review_timeout", "invalid_tutor_review",
]);

function normalizeTutorErrorMessage(message: string | undefined, fallback: string): string {
  const trimmed = message?.trim();
  if (!trimmed) return fallback;
  if (GENERIC_TUTOR_ERRORS.has(trimmed) || /^HTTP \d{3}$/.test(trimmed)) return fallback;
  return trimmed;
}

/* ─── Inline attachment (client-side base64) ─────────────────────────────── */
export interface InlineAttachment {
  id: string;
  filename: string;
  mimeType: string;
  data: string; // base64
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function isImageMime(mime: string) { return mime.startsWith("image/"); }

function resolveFilename(file: File): string {
  // Screenshots / pasted images often have generic names — normalise
  if (file.name === "image.png" || file.name === "image.jpg" || file.name === "image.jpeg") {
    const ext = file.name.split(".").pop() ?? "png";
    return `image.${ext}`;
  }
  return file.name;
}

/* ─── ChatParams ─────────────────────────────────────────────────────────── */
interface ChatParams {
  model: string;
  temperature: number;
  max_tokens: number;
  top_p?: number;
  system_message?: string;
  variables?: Record<string, string>;
  compareModel?: string;
  modelLabel?: string;
  compareModelLabel?: string;
  selfConsistencyEnabled?: boolean;
}

export interface MainInputProps {
  chatParams: ChatParams;
  aiTutor?: boolean;
  /** Show enhance button without auto-triggering tutor on send (for L3) */
  enhanceOnly?: boolean;
  mono?: boolean;
  placeholder?: string;
  disabled?: boolean;
  statusBar?: React.ReactNode;
  topSlot?: React.ReactNode;
  externalPrompt?: string | null;
  onExternalPromptConsumed?: () => void;
  sendOverride?: (text: string) => Promise<void>;
  onRawResponse?: (raw: Record<string, unknown>) => void;
  onAppendToSystem?: (text: string) => void;
  onVariableNamesChange?: (names: string[]) => void;
  isEmpty?: boolean;
  attachFilesRef?: React.MutableRefObject<((files: FileList) => void) | null>;
  inProject?: boolean;
  onManageProject?: () => void;
}

/* ─────────────────────────────────────────────────────────────────────────── */

export function MainInput({
  chatParams,
  aiTutor = false, enhanceOnly = false, mono = false, placeholder,
  disabled: externalDisabled = false,
  statusBar, topSlot,
  externalPrompt, onExternalPromptConsumed,
  sendOverride, onRawResponse,
  onAppendToSystem, onVariableNamesChange,
  isEmpty = false,
  attachFilesRef,
  inProject, onManageProject,
}: MainInputProps) {
  const isMountedRef = useRef(true);
  const { t, language } = useTranslation();
  const level = useUserLevelStore((s) => s.level);
  const userEmail = useUserLevelStore((s) => s.userEmail);
  const activeChatId = useChatStore((s) => s.activeChatId);

  /* Draft store — select the whole entry by key to keep stable references */
  const draftEntry = useDraftStore((s) => s.drafts[activeChatId ?? "__new__"]);
  const draftText = draftEntry?.text ?? "";
  const draftChips = draftEntry?.chips ?? [];
  const draftInline = draftEntry?.inlineAttachments ?? [];
  const setDraftText = useDraftStore((s) => s.setText);
  const setDraftAttachments = useDraftStore((s) => s.setAttachments);
  const clearDraft = useDraftStore((s) => s.clearDraft);

  const [isRefining, setIsRefining] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [tutorMode, setTutorMode] = useState<TutorMode>("quick");
  const [originalPrompt, setOriginalPrompt] = useState("");
  const [tutorReview, setTutorReview] = useState<TutorReview | null>(null);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [improvedPromptDraft, setImprovedPromptDraft] = useState("");
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});
  const draft = draftText;
  const setDraft = useCallback((v: string | ((prev: string) => string)) => {
    const next = typeof v === "function"
      ? v(getDraftEntry(useChatStore.getState().activeChatId).text)
      : v;
    setDraftText(useChatStore.getState().activeChatId, next);
  }, [setDraftText]);
  const refineAbortRef = useRef<AbortController | null>(null);
  const refineRequestIdRef = useRef(0);

  /* Attachments */
  const [attachmentChips, setAttachmentChipsState] = useState<AttachmentChipData[]>(draftChips);
  const inlineAttachmentsRef = useRef<InlineAttachment[]>(draftInline);
  const [previewChip, setPreviewChip] = useState<AttachmentChipData | null>(null);
  const [globalDragging, setGlobalDragging] = useState(false);
  const globalDragCountRef = useRef(0);

  const setAttachmentChips = useCallback((chips: AttachmentChipData[] | ((prev: AttachmentChipData[]) => AttachmentChipData[])) => {
    const prev = useDraftStore.getState().drafts[useChatStore.getState().activeChatId ?? "__new__"]?.chips ?? [];
    const next = typeof chips === "function" ? chips(prev) : chips;
    setAttachmentChipsState(next);
    setDraftAttachments(useChatStore.getState().activeChatId, next, inlineAttachmentsRef.current);
  }, [setDraftAttachments]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      refineAbortRef.current?.abort();
      refineAbortRef.current = null;
    };
  }, []);

  // Sync attachment chips from store when chat switches
  useEffect(() => {
    setAttachmentChipsState(draftChips);
    inlineAttachmentsRef.current = draftInline;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId]);

  useEffect(() => {
    if (externalPrompt) {
      setDraft(externalPrompt);
      onExternalPromptConsumed?.();
    }
  }, [externalPrompt, onExternalPromptConsumed]);

  useEffect(() => {
    if (!onVariableNamesChange) return;
    const tid = window.setTimeout(() => {
      onVariableNamesChange(extractVarNames(draft));
    }, VARIABLE_SYNC_DEBOUNCE_MS);
    return () => window.clearTimeout(tid);
  }, [draft, onVariableNamesChange]);

  const { analyzePrompt, trackSuggestionClick, trackCancelAction } = useUserLevelStore();
  const isSending = useChatStore((s) => s.isSending);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopGeneration = useChatStore((s) => s.stopGeneration);

  const lastKeystrokeTimeRef = useRef<number | null>(null);
  const activeTypingDurationMsRef = useRef<number>(0);
  const typingCharsRef = useRef<number>(0);
  const prevDraftLenRef = useRef<number>(0);

  const clearAttachments = useCallback(() => {
    setAttachmentChips([]);
    inlineAttachmentsRef.current = [];
    setDraftAttachments(useChatStore.getState().activeChatId, [], []);
  }, [setAttachmentChips, setDraftAttachments]);

  /* ── Send ───────────────────────────────────────────────────────────────── */
  const isDispatchingRef = useRef(false);

  const _dispatch = useCallback(async (text: string) => {
    if (isDispatchingRef.current) return;
    isDispatchingRef.current = true;

    trackEvent("prompt_submitted", { length: text.length });
    await flushEvents();
    clearDraft(useChatStore.getState().activeChatId);
    setDraft("");
    onVariableNamesChange?.([]);
    setRefineError(null);
    setModalOpen(false);

    const finalPrompt = chatParams.variables
      ? resolveVariables(text, chatParams.variables)
      : text;

    const elapsedSeconds = Math.max(activeTypingDurationMsRef.current / 1000, 0.1);
    const cps = typingCharsRef.current > 0 ? typingCharsRef.current / elapsedSeconds : 0;

    const inlineAttachments = inlineAttachmentsRef.current.slice();
    clearAttachments();

    try {
      if (sendOverride) {
        await sendOverride(finalPrompt);
        analyzePrompt(finalPrompt, cps);
        return;
      }

      const result = await sendMessage(finalPrompt, {
        userEmail,
        model: chatParams.model,
        temperature: chatParams.temperature,
        max_tokens: chatParams.max_tokens,
        top_p: chatParams.top_p,
        system_message: chatParams.system_message,
        compareModel: chatParams.compareModel,
        modelLabel: chatParams.modelLabel,
        compareModelLabel: chatParams.compareModelLabel,
        selfConsistencyEnabled: chatParams.selfConsistencyEnabled,
        inlineAttachments: inlineAttachments.length > 0 ? inlineAttachments : undefined,
      });
      if (result) {
        analyzePrompt(finalPrompt, cps);
        if (onRawResponse && result.metadata) onRawResponse(result.metadata as Record<string, unknown>);
      }
    } catch (err) {
      console.error(err);
    } finally {
      isDispatchingRef.current = false;
      lastKeystrokeTimeRef.current = null;
      activeTypingDurationMsRef.current = 0;
      typingCharsRef.current = 0;
      prevDraftLenRef.current = 0;
    }
  }, [sendOverride, sendMessage, analyzePrompt, userEmail, chatParams, onRawResponse, onVariableNamesChange, clearAttachments]);

  /* ── Tutor ──────────────────────────────────────────────────────────────── */
  const _callRefine = useCallback(async (text: string, answers?: Record<string, string>): Promise<boolean> => {
    refineAbortRef.current?.abort();
    const requestId = refineRequestIdRef.current + 1;
    refineRequestIdRef.current = requestId;
    const controller = new AbortController();
    refineAbortRef.current = controller;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => { timedOut = true; controller.abort(); }, 60_000);

    const isSecondPass = !!answers;
    trackEvent(isSecondPass ? "refine_second_pass_requested" : "tutor_opened", {
      prompt_length: text.length,
      mode: tutorMode,
    });
    setOriginalPrompt(text);
    setIsRefining(true);
    setRefineError(null);
    if (!isSecondPass) { setTutorReview(null); setImprovedPromptDraft(""); setClarificationAnswers({}); }
    setModalOpen(true);

    try {
      const payload: Record<string, unknown> = { prompt: text, language, level };
      if (answers && Object.values(answers).some((v) => v.trim())) payload.clarification_answers = answers;

      const res = await fetch("/api/refine", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload), signal: controller.signal,
      });
      if (!res.ok) throw new Error(normalizeTutorErrorMessage(await readResponseError(res, ""), t("tutor.errorDescription")));

      const data = await res.json();
      if (!isMountedRef.current || requestId !== refineRequestIdRef.current || controller.signal.aborted) return false;

      const review: TutorReview = {
        opening_message: data.opening_message ?? "",
        strengths: data.strengths ?? [],
        gaps: data.gaps ?? [],
        clarifying_questions: Array.isArray(data.clarifying_questions)
          ? data.clarifying_questions.map((q: { id?: string; question?: string } | string, i: number) =>
            typeof q === "string" ? { id: `q${i + 1}`, question: q } : { id: q.id ?? `q${i + 1}`, question: q.question ?? "" })
          : [],
        improved_prompt: data.improved_prompt ?? "",
        why_this_is_better: data.why_this_is_better ?? [],
        next_step: data.next_step ?? "",
      };
      setTutorReview(review);
      setImprovedPromptDraft(review.improved_prompt ?? "");
      setRefineError(null);
      return true;
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      const isStale = requestId !== refineRequestIdRef.current;
      if (isAbort && (isStale || !timedOut)) return false;
      if (isMountedRef.current) {
        setRefineError(timedOut ? t("tutor.errorDescription") : normalizeTutorErrorMessage(error instanceof Error ? error.message : undefined, t("tutor.errorDescription")));
        setModalOpen(true);
      }
      return true;
    } finally {
      window.clearTimeout(timeoutId);
      if (refineAbortRef.current === controller) refineAbortRef.current = null;
      if (isMountedRef.current && requestId === refineRequestIdRef.current) setIsRefining(false);
    }
  }, [t, language, level]);

  const handleSend = useCallback(async (text?: string) => {
    const trimmed = (text ?? draft).trim();
    if (!trimmed || isSending || isRefining || externalDisabled) return;

    // Explicit suggestion clicks — always dispatch directly
    if (text) { await _dispatch(trimmed); return; }

    // L1 & L2 with aiTutor: always auto-refine on send
    if (aiTutor && (level === 1 || level === 2)) {
      const opened = await _callRefine(trimmed);
      if (!opened && isMountedRef.current) await _dispatch(trimmed);
      return;
    }

    // L3 (enhanceOnly) and all others: send directly
    await _dispatch(trimmed);
  }, [draft, isSending, isRefining, externalDisabled, aiTutor, level, _callRefine, _dispatch]);

  const handleManualRefine = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || isSending || isRefining || externalDisabled) return;
    await _callRefine(trimmed);
  }, [draft, isSending, isRefining, externalDisabled, _callRefine]);

  const handleCoT = useCallback(() => {
    trackEvent("system_prompt_edited", { strategy: "cot" });
    onAppendToSystem?.(t("input.strategy.cot"));
  }, [onAppendToSystem, t]);

  const handleStepBack = useCallback(() => {
    trackEvent("system_prompt_edited", { strategy: "step_back" });
    const prefix = t("input.strategy.stepBack");
    setDraft((prev) => (prev.startsWith(prefix) ? prev : prefix + prev));
  }, [t]);

  /* ── File attach ────────────────────────────────────────────────────────── */
  const handleAttach = useCallback(async (files: FileList) => {
    const pending = Array.from(files);

    // Deduplicate: skip files already attached (same name + size)
    const existingKeys = new Set(
      inlineAttachmentsRef.current.map((a) => `${a.filename}:${a.data.length}`)
    );
    // We don't have size at this point for existing, so key by filename only for chips
    const existingNames = new Set(attachmentChips.map((c) => c.filename));
    const deduplicated = pending.filter((f) => {
      const name = resolveFilename(f);
      if (existingNames.has(name)) {
        actionToast.warning(`"${name}" is already attached`);
        return false;
      }
      return true;
    });
    if (deduplicated.length === 0) return;

    const currentCount = attachmentChips.length;
    const remaining = MAX_FILES - currentCount;

    if (remaining <= 0) {
      actionToast.warning(`Maximum ${MAX_FILES} files allowed`);
      return;
    }

    const allowed = deduplicated.slice(0, remaining);
    if (deduplicated.length > remaining) {
      actionToast.warning(`Only ${remaining} more file${remaining === 1 ? "" : "s"} can be added (max ${MAX_FILES})`);
    }

    // Size check
    const oversized = allowed.filter((f) => f.size > MAX_FILE_SIZE_BYTES);
    const valid = allowed.filter((f) => f.size <= MAX_FILE_SIZE_BYTES);
    for (const f of oversized) {
      actionToast.error(`"${f.name}" exceeds the ${MAX_FILE_SIZE_MB} MB limit`);
    }
    if (valid.length === 0) return;

    // suppress unused variable warning
    void existingKeys;

    const tempChips: AttachmentChipData[] = valid.map((f) => ({
      id: `tmp-${f.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      filename: resolveFilename(f),
      mimeType: f.type || "application/octet-stream",
      uploading: true,
    }));
    setAttachmentChips((prev) => [...prev, ...tempChips]);

    await Promise.all(
      valid.map(async (file, idx) => {
        const tempId = tempChips[idx].id;
        const filename = resolveFilename(file);
        const mimeType = file.type || "application/octet-stream";
        try {
          const [data, previewUrl] = await Promise.all([
            readFileAsBase64(file),
            isImageMime(mimeType) ? readFileAsDataUrl(file) : Promise.resolve(undefined),
          ]);

          const attachment: InlineAttachment = { id: tempId, filename, mimeType, data };
          inlineAttachmentsRef.current = [...inlineAttachmentsRef.current, attachment];

          setAttachmentChips((prev) =>
            prev.map((c) =>
              c.id === tempId
                ? { id: tempId, filename, mimeType, uploading: false, previewUrl }
                : c,
            ),
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to read file";
          setAttachmentChips((prev) =>
            prev.map((c) => c.id === tempId ? { ...c, uploading: false, error: msg } : c),
          );
        }
      }),
    );
  }, [attachmentChips.length]);

  const handleRemoveAttachment = useCallback((id: string) => {
    inlineAttachmentsRef.current = inlineAttachmentsRef.current.filter((a) => a.id !== id);
    setAttachmentChips((prev) => prev.filter((c) => c.id !== id));
  }, [setAttachmentChips]);

  // Expose handleAttach to parent (ChatLayout drag-and-drop)
  useEffect(() => {
    if (attachFilesRef) attachFilesRef.current = handleAttach;
    return () => { if (attachFilesRef) attachFilesRef.current = null; };
  }, [attachFilesRef, handleAttach]);

  // Paste images from clipboard
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      // Only intercept paste when the active element is the chat textarea itself,
      // or when nothing editable is focused (e.g. user clicked outside and hit Ctrl+V).
      const active = document.activeElement;
      const isChatTextarea = active?.classList.contains("chat-input-textarea");
      const isOtherEditable =
        active &&
        active !== document.body &&
        !isChatTextarea &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          (active as HTMLElement).isContentEditable);
      if (isOtherEditable) return;

      const items = e.clipboardData?.items;
      if (!items) return;
      const imageItems = Array.from(items).filter((item) => item.kind === "file" && item.type.startsWith("image/"));
      if (imageItems.length === 0) return;
      const files = imageItems.map((item) => {
        const blob = item.getAsFile();
        if (!blob) return null;
        const ext = item.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
        return new File([blob], `image.${ext}`, { type: item.type });
      }).filter((f): f is File => f !== null);
      if (files.length === 0) return;
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      handleAttach(dt.files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [handleAttach]);

  // Track drag state globally (any file dragged anywhere over the window)
  // and forward drops to handleAttach.
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      globalDragCountRef.current += 1;
      setGlobalDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      // relatedTarget === null means the cursor left the browser window
      if (e.relatedTarget !== null) return;
      globalDragCountRef.current = 0;
      setGlobalDragging(false);
    };
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      globalDragCountRef.current = 0;
      setGlobalDragging(false);
      if (!e.dataTransfer?.files.length) return;
      if ((e as DragEvent & { _handledByInputBox?: boolean })._handledByInputBox) return;
      e.preventDefault();
      handleAttach(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [handleAttach]);

  // Only block input when actively refining or externally disabled.
  // isSending does NOT disable the input — user can type next message while
  // the assistant is streaming; the send button switches to Stop automatically.
  const isDisabled = isRefining || externalDisabled;

  // enhance shows for aiTutor users (L1/L2) and enhanceOnly users (L3)
  const enhanceEligible = (aiTutor || enhanceOnly) && !isRefining && draft.trim().length >= ENHANCE_MIN_CHARS;
  const showEnhance = enhanceEligible;

  const showStatusBar = !!statusBar;
  const resolvedPlaceholder = placeholder ?? (mono ? t("placeholder.mono") : t("placeholder.default"));

  // Enhance button for action bar — icon-only, animate in/out
  const enhanceSlot = showEnhance ? (
    <Tooltip content={t("input.enhance")}>
      <button
        type="button"
        disabled={isDisabled}
        onClick={handleManualRefine}
        aria-label={t("input.enhance")}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent text-ds-text-tertiary transition-colors hover:bg-gray-alpha-200 hover:text-ds-text disabled:opacity-50 animate-fade-in"
      >
        {isRefining ? (
          <span className="flex items-center gap-0.5">
            {[0, 150, 300].map((d) => (
              <span key={d} className="h-1 w-1 rounded-full bg-current"
                style={{ animation: `pulse-dot 1.2s ${d}ms infinite` }} />
            ))}
          </span>
        ) : (
          <Wand2 size={16} strokeWidth={2} />
        )}
      </button>
    </Tooltip>
  ) : null;

  return (
    <>
      {/* File preview modal */}
      <FilePreviewModal chip={previewChip} onClose={() => setPreviewChip(null)} />

      {(aiTutor || enhanceOnly) && (
        <TutorModal
          open={modalOpen}
          onOpenChange={(v) => { if (isRefining) return; if (!v) setRefineError(null); setModalOpen(v); }}
          isLoading={isRefining}
          review={tutorReview}
          errorMessage={refineError}
          improvedPromptValue={improvedPromptDraft}
          clarificationAnswers={clarificationAnswers}
          onClarificationAnswerChange={(id, value) => setClarificationAnswers((prev) => ({ ...prev, [id]: value }))}
          onImprovedPromptChange={setImprovedPromptDraft}
          onRefineAgain={() => {
            const answeredCount = Object.values(clarificationAnswers).filter((v) => v.trim()).length;
            if (answeredCount > 0) trackEvent("refine_questions_answered", { answered_count: answeredCount });
            _callRefine(originalPrompt, clarificationAnswers);
          }}
          onRetry={() => _callRefine(originalPrompt, Object.values(clarificationAnswers).some((v) => v.trim()) ? clarificationAnswers : undefined)}
          onSendOriginal={() => {
            trackEvent("tutor_quick_rejected", { mode: tutorMode });
            _dispatch(originalPrompt);
          }}
          onSendImproved={(value) => {
            const improved = value.trim() || tutorReview?.improved_prompt || originalPrompt;
            trackEvent("tutor_quick_accepted", { mode: tutorMode });
            _dispatch(improved);
            useMicroFeedbackStore.getState().tryTrigger("scenario_complete");
          }}
          onCancel={() => {
            if (isRefining) return;
            trackEvent("cancel_action", { context: "refine_modal" });
            trackCancelAction();
            setRefineError(null);
            setModalOpen(false);
          }}
          onModeChange={(m) => {
            setTutorMode(m);
            trackEvent(m === "guided" ? "tutor_guided_started" : "tutor_opened", { mode: m });
          }}
          onWeaknessViewed={(gap) => trackEvent("tutor_weakness_viewed", { gap_preview: gap.slice(0, 60) })}
          onWhyBetterViewed={() => trackEvent("tutor_why_better_viewed")}
          onNextStepClicked={() => trackEvent("tutor_next_step_clicked")}
          onHelpfulnessRated={(rating) => trackEvent("tutor_helpfulness_rated", { rating })}
          onQuestionsSkipped={() => trackEvent("tutor_questions_skipped")}
        />
      )}

      <ChatInputBox
        value={draft}
        onChange={(v) => {
          const now = Date.now();
          if (lastKeystrokeTimeRef.current === null && v.length > 0) trackEvent("prompt_started");
          if (lastKeystrokeTimeRef.current !== null) {
            const delta = now - lastKeystrokeTimeRef.current;
            if (delta < 3000) activeTypingDurationMsRef.current += delta;
          }
          lastKeystrokeTimeRef.current = now;
          const charDelta = Math.abs(v.length - prevDraftLenRef.current);
          typingCharsRef.current += charDelta;
          prevDraftLenRef.current = v.length;
          setDraft(v);
        }}
        onSend={() => handleSend()}
        onStop={stopGeneration}
        placeholder={resolvedPlaceholder}
        disabled={isDisabled}
        isSending={isSending}
        mono={mono}
        topSlot={topSlot}
        attachments={attachmentChips}
        onAttach={handleAttach}
        onRemoveAttachment={handleRemoveAttachment}
        onChipClick={setPreviewChip}
        inProject={inProject}
        onManageProject={onManageProject}
        externalDragging={globalDragging}
        enhanceSlot={enhanceSlot}
        bottomSlot={
          isEmpty ? (
            <div className="min-h-[36px] flex flex-wrap items-center justify-center gap-2 mt-1">
              {level === 1 && (
                <L1Chips
                  input={draft}
                  setInput={setDraft}
                  onSendSuggestion={(text) => { trackEvent("suggestion_clicked", { text_length: text.length }); trackSuggestionClick(); handleSend(text); }}
                />
              )}
              {level === 3 && onAppendToSystem && (
                <L3StrategyChips onInjectCoT={handleCoT} onInjectStepBack={handleStepBack} />
              )}
            </div>
          ) : showStatusBar ? (
            <div className="mt-1">{statusBar}</div>
          ) : null
        }
      />
    </>
  );
}
