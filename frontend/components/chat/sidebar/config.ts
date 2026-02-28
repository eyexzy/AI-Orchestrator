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
