"use client";

import React, {
  useMemo,
  useCallback,
  useRef,
  useState,
  useEffect,
  useId,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import mermaid from "mermaid";
import {
  Copy,
  Check,
  ExternalLink,
  CheckSquare,
  Square,
  ChevronDown,
  Braces,
  Quote,
} from "lucide-react";
import type { Element } from "hast";
import type { Components } from "react-markdown";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { CodeBlock } from "@/components/ui/code-block";
import { Snippet } from "@/components/ui/snippet";
import { useTranslation } from "@/lib/store/i18nStore";

export { CodeSurface } from "@/components/ui/code-block";

const SHELL_LANGUAGES = new Set(["bash", "sh", "shell", "terminal", "console", "zsh"]);
const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function detectReActType(text: string): "thought" | "action" | "observation" | null {
  const t = text.trimStart();
  if (/^Thought\s*:/i.test(t)) return "thought";
  if (/^Action\s*:/i.test(t)) return "action";
  if (/^Observation\s*:/i.test(t)) return "observation";
  return null;
}

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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 64);
}

function looksLikeCitationLabel(label: string): boolean {
  const normalized = label.trim();
  return /^\[?\d+\]?$/.test(normalized) || /^source\s+\d+$/i.test(normalized);
}

function normalizeCitationLabel(label: string): string {
  const normalized = label.trim();
  const sourceMatch = /^source\s+(\d+)$/i.exec(normalized);
  if (sourceMatch) {
    return sourceMatch[1];
  }
  return normalized.replace(/^\[/, "").replace(/\]$/, "");
}

function guessCodeLanguage(block: string): string {
  const sample = block.trim();
  if (/^(graph|flowchart|sequenceDiagram|classDiagram|erDiagram|journey|gantt|pie)\b/m.test(sample)) {
    return "mermaid";
  }
  if (/^\s*[{[]/.test(sample)) {
    try {
      JSON.parse(sample);
      return "json";
    } catch {}
  }
  if (/^\s*(diff|index |@@ |- |\+ )/m.test(sample)) return "diff";
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\b/im.test(sample)) return "sql";
  if (/^\s*(def |from |import |class )/m.test(sample)) return "python";
  if (/^\s*(const |let |var |function |export |import )/m.test(sample)) return "typescript";
  if (/^\s*<([A-Za-z][\w-]*)(\s|>)/m.test(sample)) return "html";
  if (/^\s*[{[]/.test(sample)) return "json";
  if (sample.includes("=>") || sample.includes("console.")) return "typescript";
  if (/^\s*(npm|pnpm|yarn|git|docker|cd|ls|mkdir|rm|cp|mv)\b/m.test(sample)) return "bash";
  if (sample.includes(",") && sample.split("\n").length > 2) return "csv";
  return "text";
}

function looksLikeUnfencedCodeBlock(block: string): boolean {
  const lines = block.split("\n").filter((line) => line.trim() !== "");
  if (lines.length < 3) return false;
  if (block.includes("```")) return false;
  if (/^\s*(#|>|[-*+] |\d+\. |\|)/m.test(block)) return false;

  let score = 0;
  if (lines.filter((line) => /[{};=<>()]/.test(line)).length >= 2) score += 1;
  if (lines.filter((line) => /^\s{2,}\S/.test(line)).length >= 2) score += 1;
  if (lines.some((line) => /^(const|let|var|function|class|def|from|import|SELECT|WITH|<\w+)/i.test(line.trim()))) score += 2;
  if (lines.some((line) => /^\$ /.test(line.trim()))) score += 2;
  if (lines.some((line) => /^(graph|flowchart|sequenceDiagram|classDiagram)\b/.test(line.trim()))) score += 2;
  return score >= 2;
}

function looksLikeCodeContinuationBlock(block: string): boolean {
  const trimmed = block.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("```") || trimmed.startsWith("$$")) return false;
  if (/^\s*(#|>|[-*+] |\d+\. )/m.test(block)) return false;

  if (/^(const|let|var|function|class|interface|type|enum|export|import|return|if|else|for|while|switch|case|try|catch|finally)\b/.test(trimmed)) {
    return true;
  }
  if (/^[}\])]+[;,]?$/.test(trimmed)) {
    return true;
  }
  if (/[{};=<>()]/.test(trimmed) && trimmed.length <= 200) {
    return true;
  }
  return false;
}

function normalizeCitationPunctuation(content: string): string {
  let normalized = content;
  let previous: string | null = null;
  const citationPattern = String.raw`\[(?:\d+|[Ss]ource\s+\d+)\]\([^)]+\)`;

  while (normalized !== previous) {
    previous = normalized;
    normalized = normalized.replace(
      new RegExp(String.raw`((?:${citationPattern}\s*)+)([.,;:!?]+)`, "g"),
      (_match, citations: string, punctuation: string) => {
        const compact = citations.trim().replace(/\s+/g, "");
        return `${compact}${punctuation}`;
      },
    );
    normalized = normalized.replace(
      new RegExp(String.raw`([^\s])\s+((?:${citationPattern}\s*)+)`, "g"),
      (_match, before: string, citations: string) => {
        const compact = citations.trim().replace(/\s+/g, "");
        return `${before}\u00A0${compact}`;
      },
    );
    normalized = normalized.replace(
      new RegExp(String.raw`(${citationPattern})\s+(?=${citationPattern})`, "g"),
      "$1",
    );
  }

  return normalized;
}

function normalizeMarkdownForAI(content: string): string {
  if (!content.trim()) return content;

  const normalizedContent = normalizeCitationPunctuation(content);

  const blocks = normalizedContent.split(/\n{2,}/);
  const normalized: string[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const trimmed = block.trim();
    if (!trimmed || trimmed.startsWith("```") || trimmed.startsWith("$$")) {
      normalized.push(block);
      continue;
    }
    if (!looksLikeUnfencedCodeBlock(block)) {
      normalized.push(block);
      continue;
    }

    let merged = block.trimEnd();
    while (index + 1 < blocks.length && looksLikeCodeContinuationBlock(blocks[index + 1])) {
      index += 1;
      merged += `\n\n${blocks[index].trimEnd()}`;
    }

    const language = guessCodeLanguage(merged);
    normalized.push(`\`\`\`${language}\n${merged}\n\`\`\``);
  }

  return normalized.join("\n\n");
}

function parseDelimitedTable(source: string, delimiter: "," | "\t"): string[][] | null {
  const rows = source
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(delimiter).map((cell) => cell.trim()));

  if (rows.length < 2) return null;
  const width = rows[0].length;
  if (width < 2) return null;
  if (!rows.every((row) => row.length === width)) return null;
  return rows;
}

function ReActParagraph({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}) {
  const type = detectReActType(text);
  if (type === "thought") return <p className="react-thought">{children}</p>;
  if (type === "action") return <p className="react-action">{children}</p>;
  if (type === "observation") return <p className="react-observation">{children}</p>;
  return <p>{children}</p>;
}

function HeadingRenderer({
  level,
  children,
}: {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: React.ReactNode;
}) {
  const text = extractText(children);
  const id = slugify(text);
  const Tag = `h${level}` as const;
  return (
    <Tag id={id} className="md-heading scroll-mt-24">{children}</Tag>
  );
}

function PreviewCodeBlock({ language, code }: { language: string; code: string }) {
  return (
    <CodeBlock
      language={language}
      code={code}
      copyValue={code}
    />
  );
}

function JsonNode({
  label,
  value,
  depth = 0,
}: {
  label?: string;
  value: JsonValue;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isArray = Array.isArray(value);
  const isObject = value !== null && typeof value === "object";

  if (!isObject) {
    return (
      <div className="md-json-row">
        {label !== undefined && <span className="md-json-key">{label}</span>}
        <span className="md-json-value">
          {typeof value === "string" ? `"${value}"` : String(value)}
        </span>
      </div>
    );
  }

  const entries = isArray
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value);

  return (
    <div className="md-json-node">
      <button
        type="button"
        className="md-json-toggle"
        onClick={() => setExpanded((current) => !current)}
      >
        <ChevronDown
          size={14}
          strokeWidth={2}
          className={`transition-transform ${expanded ? "rotate-180" : "-rotate-90"}`}
          aria-hidden="true"
        />
        {label !== undefined && <span className="md-json-key">{label}</span>}
        <span className="md-json-brace">{isArray ? "[" : "{"}</span>
        <span className="md-json-meta">
          {entries.length} item{entries.length === 1 ? "" : "s"}
        </span>
        <span className="md-json-brace">{isArray ? "]" : "}"}</span>
      </button>
      {expanded && (
        <div className="md-json-children">
          {entries.map(([entryLabel, entryValue]) => (
            <JsonNode key={entryLabel} label={entryLabel} value={entryValue} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function JsonBlock({ code }: { code: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const parsed = useMemo(() => {
    try {
      return JSON.parse(code) as JsonValue;
    } catch {
      return null;
    }
  }, [code]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [code]);

  if (parsed === null) {
    return <PreviewCodeBlock language="json" code={code} />;
  }

  return (
    <div className="md-structured-card">
      <div className="md-structured-header">
        <div className="md-structured-title">
          <Braces size={14} strokeWidth={2} aria-hidden="true" />
          <span>{t("markdown.json")}</span>
        </div>
        <Tooltip content={copied ? t("markdown.copied") : t("markdown.copyJson")}>
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            onClick={handleCopy}
            aria-label={t("markdown.copyJson")}
            className="text-ds-text-tertiary hover:text-ds-text"
          >
            {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
          </Button>
        </Tooltip>
      </div>
      <div className="md-json-tree">
        <JsonNode value={parsed} />
      </div>
    </div>
  );
}

function DiffBlock({ code }: { code: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => code.split("\n"), [code]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [code]);

  return (
    <div className="md-structured-card">
      <div className="md-structured-header">
        <div className="md-structured-title">
          <span>{t("markdown.diff")}</span>
        </div>
        <Tooltip content={copied ? t("markdown.copied") : t("markdown.copyDiff")}>
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            onClick={handleCopy}
            aria-label={t("markdown.copyDiff")}
            className="text-ds-text-tertiary hover:text-ds-text"
          >
            {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
          </Button>
        </Tooltip>
      </div>
      <div className="md-diff-block">
        {lines.map((line, index) => {
          const kind =
            line.startsWith("+") ? "added" :
            line.startsWith("-") ? "removed" :
            line.startsWith("@@") ? "meta" :
            "neutral";

          return (
            <div key={`${index}-${line}`} className={`md-diff-line md-diff-${kind}`}>
              <span className="md-diff-line-number">{index + 1}</span>
              <span className="md-diff-line-text">{line || " "}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StructuredTable({ rows, delimiterLabel }: { rows: string[][]; delimiterLabel: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(rows.map((row) => row.join("\t")).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [rows]);

  return (
    <div className="md-table-wrap">
      <div className="md-table-header">
        <span className="md-table-label">{delimiterLabel}</span>
        <Tooltip content={copied ? t("markdown.copied") : t("markdown.copyTable")}>
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            onClick={handleCopy}
            aria-label={t("markdown.copyTable")}
            className="text-ds-text-tertiary hover:text-ds-text"
          >
            {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
          </Button>
        </Tooltip>
      </div>
      <div className="md-table-scroll">
        <table>
          <thead>
            <tr>
              {rows[0].map((cell, index) => <th key={index}>{cell}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.slice(1).map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MermaidBlock({ chart }: { chart: string }) {
  const { t } = useTranslation();
  const id = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const rootStyles = getComputedStyle(document.documentElement);
    const background = rootStyles.getPropertyValue("--ds-background-100").trim() || "#0a0a0a";
    const foreground = rootStyles.getPropertyValue("--geist-foreground").trim() || "#fafafa";
    const muted = rootStyles.getPropertyValue("--ds-gray-900").trim() || "#a1a1a1";
    const border = rootStyles.getPropertyValue("--ds-gray-alpha-400").trim() || "rgba(255,255,255,0.14)";

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      fontFamily: "Geist, Arial, sans-serif",
      themeVariables: {
        background,
        mainBkg: background,
        secondBkg: background,
        tertiaryColor: background,
        primaryColor: background,
        primaryBorderColor: border,
        primaryTextColor: foreground,
        secondaryColor: background,
        secondaryBorderColor: border,
        secondaryTextColor: foreground,
        tertiaryBorderColor: border,
        tertiaryTextColor: foreground,
        lineColor: muted,
        textColor: foreground,
        nodeBorder: border,
        clusterBkg: background,
        clusterBorder: border,
        edgeLabelBackground: background,
        labelBackground: background,
        actorBkg: background,
        actorBorder: border,
        actorTextColor: foreground,
        signalColor: muted,
        signalTextColor: foreground,
        loopTextColor: foreground,
        noteBkgColor: background,
        noteBorderColor: border,
        noteTextColor: foreground,
        activationBorderColor: border,
        activationBkgColor: background,
        sequenceNumberColor: foreground,
        arrowheadColor: muted,
      },
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: "basis",
      },
    });

    mermaid.render(`mermaid-${id}`, chart)
      .then(({ svg: nextSvg }) => {
        if (!active) return;
        setSvg(nextSvg);
        setError(null);
      })
      .catch((nextError: unknown) => {
        if (!active) return;
        setError(nextError instanceof Error ? nextError.message : t("markdown.diagramError"));
        setSvg(null);
      });

    return () => {
      active = false;
    };
  }, [chart, id]);

  if (error) {
    return (
      <div className="my-3">
        <div className="md-mermaid-error">{t("markdown.mermaidFailed")}: {error}</div>
        <PreviewCodeBlock language="mermaid" code={chart} />
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="md-mermaid-card">
        <div className="md-mermaid-loading">{t("markdown.renderingDiagram")}</div>
      </div>
    );
  }

  return (
    <div className="md-mermaid-card">
      <div
        className="md-mermaid-canvas"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}

function CollapsibleBlockquote({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <blockquote className="md-callout">
      <div className="md-callout-shell">
        <div className="md-callout-head">
          <Quote size={14} strokeWidth={2} aria-hidden="true" />
          <span>{t("markdown.quote")}</span>
        </div>
        <div className="md-callout-body">{children}</div>
      </div>
    </blockquote>
  );
}

function LinkRenderer({ href, children }: { href?: string; children: React.ReactNode }) {
  const label = extractText(children);
  const citationLabel = normalizeCitationLabel(label);
  const normalizedHref = (() => {
    if (!href) return undefined;
    if (href.startsWith("#") || href.startsWith("/")) return href;
    try {
      const needsProtocol = /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#]|$)/i.test(href) && !/^[a-z][a-z0-9+.-]*:/i.test(href);
      const candidate = needsProtocol ? `https://${href}` : href;
      const parsed = new URL(candidate, "https://local.invalid");
      if (!SAFE_LINK_PROTOCOLS.has(parsed.protocol)) {
        return undefined;
      }
      return candidate;
    } catch {
      return undefined;
    }
  })();
  const isExternal = normalizedHref?.startsWith("http");
  const isCitation = looksLikeCitationLabel(label);

  if (!normalizedHref) {
    return <span>{children}</span>;
  }

  return (
    isCitation ? (
      <a
        href={normalizedHref}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        className="md-citation-link"
        aria-label={`Source ${citationLabel}`}
      >
        [{citationLabel}]
      </a>
    ) : (
      <a
        href={normalizedHref}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
      >
        {children}
        {isExternal && (
          <ExternalLink size={10} strokeWidth={2} className="md-ext-icon" />
        )}
      </a>
    )
  );
}

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

function isTaskListCheckboxNode(value: unknown): value is Element {
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

export function MarkdownRenderer({ content }: { content: string }) {
  const { t } = useTranslation();
  const normalizedContent = useMemo(() => normalizeMarkdownForAI(content), [content]);

  const components: Components = useMemo(() => ({
    code({ className, children }) {
      const code = String(children).replace(/\n$/, "");
      const isInline = !className && !code.includes("\n");

      if (isInline) {
        return <code className={className}>{children}</code>;
      }

      const match = /language-([\w-]+)/.exec(className || "");
      const lang = match?.[1]?.toLowerCase() || guessCodeLanguage(code);

      if (lang === "mermaid") {
        return <MermaidBlock chart={code} />;
      }

      if (lang === "json") {
        return <JsonBlock code={code} />;
      }

      if (lang === "diff" || lang === "patch") {
        return <DiffBlock code={code} />;
      }

      if (lang === "csv" || lang === "tsv") {
        const rows = parseDelimitedTable(code, lang === "csv" ? "," : "\t");
        if (rows) {
          return (
            <StructuredTable
              rows={rows}
              delimiterLabel={lang === "csv" ? t("markdown.csv") : t("markdown.tsv")}
            />
          );
        }
      }

      if (SHELL_LANGUAGES.has(lang)) {
        const lines = code
          .split("\n")
          .filter((line) => line.trim() !== "");

        return (
          <div className="my-4 flex flex-col gap-2">
            {lines.map((line, index) => {
              const trimmed = line.trim();
              if (trimmed.startsWith("#")) {
                return <span key={index} className="snippet-comment">{trimmed}</span>;
              }
              return (
                <Snippet key={index}>
                  {trimmed.replace(/^\$\s*/, "")}
                </Snippet>
              );
            })}
          </div>
        );
      }

      return <PreviewCodeBlock language={lang} code={code} />;
    },
    p({ children }) {
      const rawText = extractText(children);
      return <ReActParagraph text={rawText}>{children}</ReActParagraph>;
    },
    blockquote({ children }) {
      return <CollapsibleBlockquote>{children}</CollapsibleBlockquote>;
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
    h1({ children }) {
      return <HeadingRenderer level={1}>{children}</HeadingRenderer>;
    },
    h2({ children }) {
      return <HeadingRenderer level={2}>{children}</HeadingRenderer>;
    },
    h3({ children }) {
      return <HeadingRenderer level={3}>{children}</HeadingRenderer>;
    },
    h4({ children }) {
      return <HeadingRenderer level={4}>{children}</HeadingRenderer>;
    },
    h5({ children }) {
      return <HeadingRenderer level={5}>{children}</HeadingRenderer>;
    },
    h6({ children }) {
      return <HeadingRenderer level={6}>{children}</HeadingRenderer>;
    },
    hr() {
      return <hr className="md-divider" />;
    },
  }), [t]);

  return (
    <div className="md text-[15px] leading-7">
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
