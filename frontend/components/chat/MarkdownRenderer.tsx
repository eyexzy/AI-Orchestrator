"use client";

import React, { useMemo, useCallback, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, ExternalLink, CheckSquare, Square } from "lucide-react";
import type { Element } from "hast";
import type { Components } from "react-markdown";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { CodeBlock } from "@/components/ui/code-block";
import { Snippet } from "@/components/ui/snippet";

export { CodeSurface } from "@/components/ui/code-block";

const SHELL_LANGUAGES = new Set(["bash", "sh", "shell", "terminal", "console", "zsh"]);

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
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) return children.map(extractText).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(children)) {
    return extractText(children.props.children);
  }
  return "";
}

function isTaskListCheckboxNode(
  value: unknown,
): value is Element {
  if (!value || typeof value !== "object") return false;

  const candidate = value as {
    type?: unknown;
    tagName?: unknown;
    properties?: { type?: unknown; checked?: unknown };
  };

  return (
    candidate.type === "element" &&
    candidate.tagName === "input" &&
    candidate.properties?.type === "checkbox"
  );
}

function isInputElement(
  child: React.ReactNode,
): child is React.ReactElement<React.InputHTMLAttributes<HTMLInputElement>, "input"> {
  return React.isValidElement(child) && child.type === "input";
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
            className="text-ds-text-tertiary hover:text-ds-text"
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
          <CheckSquare size={16} strokeWidth={2} className="text-blue-700" />
        ) : (
          <Square size={16} strokeWidth={2} className="text-gray-500" />
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

      if (match) {
        const lang = match[1];

        if (SHELL_LANGUAGES.has(lang.toLowerCase())) {
          const lines = code
            .split("\n")
            .filter((line) => line.trim() !== "");

          return (
            <div className="my-4 flex flex-col gap-2">
              {lines.map((line, i) => {
                const trimmed = line.trim();
                if (trimmed.startsWith("#")) {
                  return (
                    <span key={i} className="snippet-comment">{trimmed}</span>
                  );
                }
                return (
                  <Snippet key={i}>
                    {trimmed.replace(/^\$\s*/, "")}
                  </Snippet>
                );
              })}
            </div>
          );
        }

        return <CodeBlock language={lang} code={code} />;
      }

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
      const inputChild = Array.isArray(node?.children)
        ? node.children.find(isTaskListCheckboxNode)
        : undefined;

      if (inputChild) {
        const checked = Boolean(inputChild.properties?.checked);
        const filteredChildren = Array.isArray(children)
          ? children.filter((child) => !isInputElement(child))
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