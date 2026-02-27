"use client";

import { useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

/* ── Refined syntax theme ─────────────────────────────────────── */
const CODE_THEME: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': {
    color: "#c9d1d9", background: "none",
    fontFamily: "'IBM Plex Mono', monospace", fontSize: "12.5px", lineHeight: 1.6,
  },
  'pre[class*="language-"]': {
    color: "#c9d1d9", background: "none",
    margin: 0, padding: "1rem", overflow: "auto",
  },
  comment:      { color: "#4a5568", fontStyle: "italic" },
  prolog:       { color: "#4a5568" },
  doctype:      { color: "#4a5568" },
  cdata:        { color: "#4a5568" },
  punctuation:  { color: "#718096" },
  property:     { color: "#79c0ff" },
  tag:          { color: "#ff7b72" },
  boolean:      { color: "#ffa657" },
  number:       { color: "#ffa657" },
  constant:     { color: "#79c0ff" },
  symbol:       { color: "#ffa657" },
  deleted:      { color: "#ff7b72" },
  selector:     { color: "#7ee787" },
  "attr-name":  { color: "#7ee787" },
  string:       { color: "#a5d6ff" },
  char:         { color: "#a5d6ff" },
  builtin:      { color: "#7ee787" },
  inserted:     { color: "#7ee787" },
  operator:     { color: "#c9d1d9" },
  entity:       { color: "#c9d1d9", cursor: "help" },
  url:          { color: "#79c0ff" },
  "attr-value": { color: "#a5d6ff" },
  keyword:      { color: "#ff7b72" },
  atrule:       { color: "#7ee787" },
  function:     { color: "#d2a8ff" },
  "class-name": { color: "#ffa657" },
  regex:        { color: "#a5d6ff" },
  important:    { color: "#ff7b72", fontWeight: "bold" },
  variable:     { color: "#ffa657" },
  bold:         { fontWeight: "bold" },
  italic:       { fontStyle: "italic" },
};

/* ── Copy icon ────────────────────────────────────────────────── */
function IconCopy({ done }: { done: boolean }) {
  if (done) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  );
}

/* ── Code block ───────────────────────────────────────────────── */
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [code]);

  return (
    <div
      className="group relative my-4 overflow-hidden"
      style={{
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgb(13, 13, 18)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <div
        className="flex items-center justify-between px-4"
        style={{ height: 36, borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.015)" }}
      >
        <span className="font-mono text-[10px] select-none" style={{ color: "rgba(255,255,255,0.25)", letterSpacing: "0.06em" }}>
          {language || "text"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="flex items-center gap-1.5 font-mono text-[10px] transition-all duration-150"
          style={{
            padding: "3px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)",
            background: hovered ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
            backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
            color: copied ? "rgb(52,211,153)" : hovered ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)",
            opacity: hovered || copied ? 1 : 0,
            transform: hovered ? "translateY(0)" : "translateY(1px)",
            cursor: "pointer", letterSpacing: "0.04em", pointerEvents: "auto",
          }}
          aria-label="Copy code"
        >
          <IconCopy done={copied} />
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || "text"}
        style={CODE_THEME as any}
        PreTag="div"
        customStyle={{ margin: 0, padding: "14px 16px", background: "transparent", fontSize: "12.5px", lineHeight: 1.65 }}
        codeTagProps={{ style: { fontFamily: "'IBM Plex Mono', monospace" } }}
        showLineNumbers={false}
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

/* ── ReAct trace line detector ────────────────────────────────── */
function detectReActType(text: string): "thought" | "action" | "observation" | null {
  const t = text.trimStart();
  if (/^Thought\s*:/i.test(t)) return "thought";
  if (/^Action\s*:/i.test(t)) return "action";
  if (/^Observation\s*:/i.test(t)) return "observation";
  return null;
}

/**
 * Wrap a paragraph text through ReAct detection.
 * Returns the JSX for the paragraph (possibly highlighted).
 */
function ReActParagraph({ text, children }: { text: string; children: React.ReactNode }) {
  const type = detectReActType(text);

  if (type === "thought") {
    return (
      <p className="react-thought">
        {children}
      </p>
    );
  }
  if (type === "action") {
    return (
      <p className="react-action">
        {children}
      </p>
    );
  }
  if (type === "observation") {
    return (
      <p className="react-observation">
        {children}
      </p>
    );
  }

  return <p>{children}</p>;
}

/* Helper to extract raw text from react-markdown children */
function extractText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(extractText).join("");
  if (children && typeof children === "object" && "props" in (children as any)) {
    return extractText((children as any).props.children);
  }
  return "";
}

export function MarkdownRenderer({ content }: { content: string }) {
  const components: Components = {
    code({ className, children }) {
      const match = /language-(\w+)/.exec(className || "");
      const code = String(children).replace(/\n$/, "");
      if (match) return <CodeBlock language={match[1]} code={code} />;
      return <code className={className}>{children}</code>;
    },
    p({ children }) {
      const rawText = extractText(children);
      return <ReActParagraph text={rawText}>{children}</ReActParagraph>;
    },
  };

  return (
    <div className="md text-[14px]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}