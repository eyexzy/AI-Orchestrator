export const MODELS = [
  { value: "llama-3.3-70b",    label: "Llama 3.3 70B · Groq" },
  { value: "llama-3.1-8b",     label: "Llama 3.1 8B · Groq" },
  { value: "mixtral-8x7b",     label: "Mixtral 8x7B · Groq" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { value: "gemini-1.5-pro",   label: "Gemini 1.5 Pro" },
  { value: "or-llama-70b",     label: "Llama 70B · OR" },
  { value: "or-deepseek-r1",   label: "DeepSeek R1 · OR" },
  { value: "or-gemma-27b",     label: "Gemma 3 27B · OR" },
  { value: "or-qwen3-coder",   label: "Qwen3 Coder · OR" },
  { value: "or-mistral-small", label: "Mistral Small · OR" },
  { value: "gpt-4o",           label: "GPT-4o" },
  { value: "gpt-4o-mini",      label: "GPT-4o Mini" },
];

export const DEFAULT_SYSTEM = "You are a helpful AI assistant. Respond in Ukrainian.";

export interface FewShotExample {
  input: string;
  output: string;
}

export interface SidebarConfig {
  model: string;
  setModel: (v: string) => void;
  temperature: number;
  setTemperature: (v: number) => void;
  maxTokens: number;
  setMaxTokens: (v: number) => void;
  showTpl?: boolean;
  setShowTpl?: React.Dispatch<React.SetStateAction<boolean>>;
  onLoadTemplate?: (
    prompt: string,
    vars: Record<string, string>,
    system?: string
  ) => void;
  system?: string;
  setSystem?: (v: string) => void;
  variables?: Record<string, string>;
  setVariables?: (v: Record<string, string>) => void;
  topP?: number;
  setTopP?: (v: number) => void;
  topK?: number;
  setTopK?: (v: number) => void;
  fewShotExamples?: FewShotExample[];
  setFewShotExamples?: (v: FewShotExample[]) => void;
  compareEnabled?: boolean;
  setCompareEnabled?: (v: boolean) => void;
  compareModelA?: string;
  setCompareModelA?: (v: string) => void;
  compareModelB?: string;
  setCompareModelB?: (v: string) => void;
  rawJsonEnabled?: boolean;
  setRawJsonEnabled?: (v: boolean) => void;
  selfConsistencyEnabled?: boolean;
  setSelfConsistencyEnabled?: (v: boolean) => void;
}
