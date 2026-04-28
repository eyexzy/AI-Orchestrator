import { create } from "zustand";

interface UiShellState {
  feedbackOpen: boolean;
  openFeedback: () => void;
  setFeedbackOpen: (open: boolean) => void;
  closeFeedback: () => void;
}

export const useUiShellStore = create<UiShellState>((set) => ({
  feedbackOpen: false,
  openFeedback: () => set({ feedbackOpen: true }),
  setFeedbackOpen: (open) => set({ feedbackOpen: open }),
  closeFeedback: () => set({ feedbackOpen: false }),
}));