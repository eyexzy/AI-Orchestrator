"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import remarkGfm from "remark-gfm";
import { Copy, Check, FileCode, ExternalLink, CheckSquare, Square } from "lucide-react";
import type { Components } from "react-markdown";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

/* language names */
function formatLanguageName(lang: string): string {
  const map: Record<string, string> = {
    js: "JavaScript", javascript: "JavaScript",
    ts: "TypeScript", typescript: "TypeScript",
    jsx: "React", tsx: "React",
    py: "Python", python: "Python",
    sh: "Bash", bash: "Bash", shell: "Terminal",
    json: "JSON", html: "HTML", css: "CSS",
    java: "Java", cpp: "C++", c: "C", go: "Go",
    rs: "Rust", rust: "Rust", sql: "SQL",
    md: "Markdown", markdown: "Markdown",
    yaml: "YAML", yml: "YAML",
  };
  return map[lang.toLowerCase()] || lang;
}

/* Syntax Highlighting Palette */
export const CODE_THEME: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': { color: "var(--ds-gray-1000)", background: "none", fontFamily: "var(--font-geist-mono), monospace", fontSize: "13px", lineHeight: "24px", fontStyle: "normal" },
  'pre[class*="language-"]': { color: "var(--ds-gray-1000)", background: "none", margin: 0, padding: 0, overflow: "auto", fontStyle: "normal" },
  tag: { color: "var(--ds-green-900)", fontStyle: "normal" },
  keyword: { color: "var(--ds-pink-900)", fontStyle: "normal" },
  boolean: { color: "var(--ds-pink-900)", fontStyle: "normal" },
  operator: { color: "var(--ds-gray-1000)", fontStyle: "normal" },
  constant: { color: "var(--ds-purple-900)", fontStyle: "normal" },
  function: { color: "var(--ds-purple-900)", fontStyle: "normal" },
  "class-name": { color: "var(--ds-purple-900)", fontStyle: "normal" },
  "attr-name": { color: "var(--ds-blue-900)", fontStyle: "normal" },
  property: { color: "var(--ds-blue-900)", fontStyle: "normal" },
  url: { color: "var(--ds-blue-900)", fontStyle: "normal" },
  string: { color: "var(--ds-green-900)", fontStyle: "normal" },
  char: { color: "var(--ds-green-900)", fontStyle: "normal" },
  "attr-value": { color: "var(--ds-green-900)", fontStyle: "normal" },
  regex: { color: "var(--ds-green-900)", fontStyle: "normal" },
  selector: { color: "var(--ds-green-900)", fontStyle: "normal" },
  builtin: { color: "var(--ds-green-900)", fontStyle: "normal" },
  inserted: { color: "var(--ds-green-900)", fontStyle: "normal" },
  atrule: { color: "var(--ds-green-900)", fontStyle: "normal" },
  "template-string": { color: "var(--ds-green-900)", fontStyle: "normal" },
  punctuation: { color: "var(--ds-gray-1000)", fontStyle: "normal" },
  entity: { color: "var(--ds-gray-1000)", fontStyle: "normal", cursor: "help" },
  variable: { color: "var(--ds-gray-1000)", fontStyle: "normal" },
  number: { color: "var(--ds-amber-900)", fontStyle: "normal" },
  symbol: { color: "var(--ds-amber-900)", fontStyle: "normal" },
  comment: { color: "var(--ds-gray-900)", fontStyle: "normal" },
  prolog: { color: "var(--ds-gray-900)", fontStyle: "normal" },
  doctype: { color: "var(--ds-gray-900)", fontStyle: "normal" },
  cdata: { color: "var(--ds-gray-900)", fontStyle: "normal" },
  deleted: { color: "var(--ds-pink-900)", fontStyle: "normal" },
  important: { color: "var(--ds-pink-900)", fontWeight: "bold", fontStyle: "normal" },
  bold: { fontWeight: "bold" },
  italic: { fontStyle: "normal" },
};

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [selectedLines, setSelectedLines] = useState<number[]>([]);

  /* Copy handler */
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
    }
  }, [code]);

  /* Line selection toggle */
  const toggleLine = useCallback((lineNum: number) => {
    setSelectedLines((prev) =>
      prev.includes(lineNum)
        ? prev.filter((n) => n !== lineNum)
        : [...prev, lineNum],
    );
  }, []);

  const lang = language || "text";

  return (
    <div className="my-6 overflow-hidden rounded-md border border-gray-alpha-400 bg-background-100">
      {/* Header */}
      <div className="flex items-center justify-between pl-3 pr-4 h-12 border-b border-gray-alpha-400 bg-background-200">
        {/* Left: file icon + language label */}
        <div className="flex items-center gap-2">
          <FileCode size={14} strokeWidth={2} className="opacity-70" />
          <span className="font-mono text-[13px] text-ds-gray-900 select-none">
            {formatLanguageName(lang)}
          </span>
        </div>

        {/* Right: icon-only copy button */}
        <Tooltip content={copied ? "Copied!" : "Copy code"}>
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            onClick={handleCopy}
            aria-label="Copy code"
          >
            {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
          </Button>
        </Tooltip>
      </div>

      {/* Code body */}
      <SyntaxHighlighter
        language={lang}
        style={CODE_THEME as any}
        PreTag="div"
        showLineNumbers={true}
        wrapLines={true}
        lineNumberStyle={{
          minWidth: "3em",
          paddingRight: "1em",
          textAlign: "right" as const,
          userSelect: "none" as const,
          color: "var(--ds-gray-900)",
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: "13px",
          lineHeight: "24px",
          fontStyle: "normal",
        }}
        lineProps={(lineNumber: number) => {
          const isSelected = selectedLines.includes(lineNumber);
          return {
            style: {
              display: "block",
              padding: "0 16px",
              cursor: "pointer",
              borderLeft: isSelected
                ? "2px solid var(--ds-blue-900)"
                : "2px solid transparent",
              background: isSelected
                ? "var(--ds-blue-300)"
                : "transparent",
              transition: "background 0.1s ease, border-color 0.1s ease",
            },
            onClick: () => toggleLine(lineNumber),
            onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
              if (!isSelected) {
                e.currentTarget.style.background = "var(--ds-gray-alpha-100)";
              }
            },
            onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
              if (!isSelected) {
                e.currentTarget.style.background = "transparent";
              }
            },
          };
        }}
        customStyle={{
          margin: 0,
          padding: "20px 0",
          background: "transparent",
          fontSize: "13px",
          fontWeight: 500,
          lineHeight: "24px",
          fontStyle: "normal",
        }}
        codeTagProps={{
          style: {
            fontFamily: "var(--font-geist-mono), monospace",
            fontWeight: 500,
            fontStyle: "normal",
          },
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

/* ReAct trace line detect */
function detectReActType(
  text: string,
): "thought" | "action" | "observation" | null {
  const t = text.trimStart();
  if (/^Thought\s*:/i.test(t)) return "thought";
  if (/^Action\s*:/i.test(t)) return "action";
  if (/^Observation\s*:/i.test(t)) return "observation";
  return null;
}

function ReActParagraph({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}) {
  const type = detectReActType(text);
  if (type === "thought")
    return <p className="react-thought">{children}</p>;
  if (type === "action")
    return <p className="react-action">{children}</p>;
  if (type === "observation")
    return <p className="react-observation">{children}</p>;
  return <p>{children}</p>;
}

/* Helper to extract raw text from react-markdown children */
function extractText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(extractText).join("");
  if (
    children &&
    typeof children === "object" &&
    "props" in (children as any)
  ) {
    return extractText((children as any).props.children);
  }
  return "";
}

/* Custom components for enhanced rendering */

/* Table with copy button — mirrors CodeBlock header pattern */
function TableBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  const handleCopy = useCallback(async () => {
    if (!tableRef.current) return;
    const table = tableRef.current.querySelector("table");
    if (!table) return;

    const rows = Array.from(table.querySelectorAll("tr"));
    const tsv = rows
      .map((row) =>
        Array.from(row.querySelectorAll("th, td"))
          .map((cell) => cell.textContent?.trim() ?? "")
          .join("\t")
      )
      .join("\n");

    try {
      await navigator.clipboard.writeText(tsv);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, []);

  return (
    <div className="md-table-wrap" ref={tableRef}>
      <div className="md-table-header">
        <span className="md-table-label">Table</span>
        <Tooltip content={copied ? "Copied!" : "Copy table"}>
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            onClick={handleCopy}
            aria-label="Copy table"
          >
            {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
          </Button>
        </Tooltip>
      </div>
      <div className="md-table-scroll">
        <table>{children}</table>
      </div>
    </div>
  );
}

/* Link with external icon for http links */
function LinkRenderer({ href, children }: { href?: string; children: React.ReactNode }) {
  const isExternal = href?.startsWith("http");
  return (
    <a
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
    >
      {children}
      {isExternal && (
        <ExternalLink size={10} strokeWidth={2} className="md-ext-icon" />
      )}
    </a>
  );
}

/* Task list item with CheckSquare/Square icons */
function TaskListItem({ checked, children }: { checked?: boolean; children: React.ReactNode }) {
  return (
    <li className="md-task-item">
      <span className="md-task-check">
        {checked ? (
          <CheckSquare size={16} strokeWidth={2} className="text-[var(--ds-blue-700)]" />
        ) : (
          <Square size={16} strokeWidth={2} className="text-[var(--ds-gray-500)]" />
        )}
      </span>
      <span className={checked ? "md-task-done" : ""}>{children}</span>
    </li>
  );
}

/* MarkdownRenderer */
export function MarkdownRenderer({ content }: { content: string }) {
  const components: Components = useMemo(() => ({
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
    table({ children }) {
      return <TableBlock>{children}</TableBlock>;
    },
    a({ href, children }) {
      return <LinkRenderer href={href}>{children}</LinkRenderer>;
    },
    li({ children, node }) {
      const inputChild = node?.children?.find(
        (child: any) => child.tagName === "input" && child.properties?.type === "checkbox"
      );
      if (inputChild) {
        const checked = !!(inputChild as any).properties?.checked;
        const filteredChildren = Array.isArray(children)
          ? children.filter((child: any) => {
              if (typeof child === "object" && child?.type === "input") return false;
              return true;
            })
          : children;
        return <TaskListItem checked={checked}>{filteredChildren}</TaskListItem>;
      }
      return <li>{children}</li>;
    },
  }), []);

  return (
    <div className="md text-[15px] leading-7">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}