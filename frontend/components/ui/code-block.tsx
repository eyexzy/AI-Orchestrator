"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  PrismLight as SyntaxHighlighter,
  type SyntaxHighlighterProps,
} from "react-syntax-highlighter";
import bashLanguage from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import cLanguage from "react-syntax-highlighter/dist/esm/languages/prism/c";
import cppLanguage from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import cssLanguage from "react-syntax-highlighter/dist/esm/languages/prism/css";
import goLanguage from "react-syntax-highlighter/dist/esm/languages/prism/go";
import javaLanguage from "react-syntax-highlighter/dist/esm/languages/prism/java";
import javascriptLanguage from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import jsonLanguage from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsxLanguage from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import markdownLanguage from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import markupLanguage from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import pythonLanguage from "react-syntax-highlighter/dist/esm/languages/prism/python";
import rustLanguage from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import sqlLanguage from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import tsxLanguage from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescriptLanguage from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yamlLanguage from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import { Copy, Check, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

/* language names */
export function formatLanguageName(lang: string): string {
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

type SyntaxTheme = NonNullable<SyntaxHighlighterProps["style"]>;
type SyntaxLanguageDefinition = Parameters<typeof SyntaxHighlighter.registerLanguage>[1];
type ResolvedThemeMode = "light" | "dark";

export { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
export { type SyntaxHighlighterProps } from "react-syntax-highlighter";

export const CODE_FONT_FAMILY = "var(--font-geist-mono), monospace";

const REGISTERED_LANGUAGES: Array<[string, SyntaxLanguageDefinition]> = [
  ["bash", bashLanguage],
  ["sh", bashLanguage],
  ["shell", bashLanguage],
  ["c", cLanguage],
  ["cpp", cppLanguage],
  ["css", cssLanguage],
  ["go", goLanguage],
  ["java", javaLanguage],
  ["javascript", javascriptLanguage],
  ["js", javascriptLanguage],
  ["json", jsonLanguage],
  ["jsx", jsxLanguage],
  ["markdown", markdownLanguage],
  ["md", markdownLanguage],
  ["markup", markupLanguage],
  ["html", markupLanguage],
  ["xml", markupLanguage],
  ["python", pythonLanguage],
  ["py", pythonLanguage],
  ["rust", rustLanguage],
  ["rs", rustLanguage],
  ["sql", sqlLanguage],
  ["tsx", tsxLanguage],
  ["typescript", typescriptLanguage],
  ["ts", typescriptLanguage],
  ["yaml", yamlLanguage],
  ["yml", yamlLanguage],
];

let syntaxLanguagesRegistered = false;

function ensureSyntaxLanguagesRegistered() {
  if (syntaxLanguagesRegistered) return;

  for (const [alias, definition] of REGISTERED_LANGUAGES) {
    SyntaxHighlighter.registerLanguage(alias, definition);
  }

  syntaxLanguagesRegistered = true;
}

export function createCodeTheme(mode: ResolvedThemeMode): SyntaxTheme {
  const commentColor =
    mode === "dark" ? "var(--ds-gray-700)" : "var(--ds-gray-900)";

  return {
    'code[class*="language-"]': {
      color: "var(--ds-gray-1000)",
      background: "none",
      fontFamily: CODE_FONT_FAMILY,
      fontSize: "inherit",
      lineHeight: "inherit",
      fontStyle: "normal",
    },
    'pre[class*="language-"]': {
      color: "var(--ds-gray-1000)",
      background: "none",
      margin: 0,
      padding: 0,
      overflow: "auto",
      fontStyle: "normal",
    },
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
    entity: {
      color: "var(--ds-gray-1000)",
      fontStyle: "normal",
      cursor: "help",
    },
    variable: { color: "var(--ds-gray-1000)", fontStyle: "normal" },
    number: { color: "var(--ds-amber-900)", fontStyle: "normal" },
    symbol: { color: "var(--ds-amber-900)", fontStyle: "normal" },
    comment: { color: commentColor, fontStyle: "normal" },
    prolog: { color: commentColor, fontStyle: "normal" },
    doctype: { color: commentColor, fontStyle: "normal" },
    cdata: { color: commentColor, fontStyle: "normal" },
    deleted: { color: "var(--ds-pink-900)", fontStyle: "normal" },
    important: {
      color: "var(--ds-pink-900)",
      fontWeight: "bold",
      fontStyle: "normal",
    },
    bold: { fontWeight: "bold" },
    italic: { fontStyle: "normal" },
  };
}

ensureSyntaxLanguagesRegistered();

export function CodeSurface({
  language,
  code,
  showLineNumbers = true,
  selectableLines = showLineNumbers,
  padding = "1.25rem 0",
}: {
  language: string;
  code: string;
  showLineNumbers?: boolean;
  selectableLines?: boolean;
  padding?: string;
}) {
  const { resolvedTheme } = useTheme();
  const [selectedLines, setSelectedLines] = useState<number[]>([]);
  const isDark = resolvedTheme === "dark";
  const codeTheme = useMemo(
    () => createCodeTheme(isDark ? "dark" : "light"),
    [isDark],
  );

  const handleToggleLine = useCallback(
    (lineNumber: number) => {
      if (!selectableLines) return;
      setSelectedLines((previous) =>
        previous.includes(lineNumber)
          ? previous.filter((value) => value !== lineNumber)
          : [...previous, lineNumber],
      );
    },
    [selectableLines],
  );

  const lineNumberStyle = useMemo<
    NonNullable<SyntaxHighlighterProps["lineNumberStyle"]>
  >(
    () => ({
      minWidth: "3em",
      paddingRight: "1em",
      textAlign: "right",
      userSelect: "none",
      color: isDark ? "var(--ds-gray-700)" : "var(--ds-gray-900)",
      fontFamily: CODE_FONT_FAMILY,
      fontSize: "inherit",
      lineHeight: "inherit",
      fontStyle: "normal",
    }),
    [isDark],
  );

  const lineProps = useCallback(
    (lineNumber: number): React.HTMLProps<HTMLElement> => {
      const isSelected = selectableLines && selectedLines.includes(lineNumber);

      return {
        style: {
          display: "block",
          padding: "0 16px",
          cursor: selectableLines ? "pointer" : "default",
          borderLeft: selectableLines
            ? isSelected
              ? "2px solid var(--ds-blue-700)"
              : "2px solid transparent"
            : undefined,
          background: isSelected
            ? isDark
              ? "var(--ds-blue-200)"
              : "var(--ds-blue-300)"
            : "transparent",
          transition: selectableLines
            ? "background 0.1s ease, border-color 0.1s ease"
            : undefined,
        },
        onClick: selectableLines ? () => handleToggleLine(lineNumber) : undefined,
        onMouseEnter: selectableLines
          ? (event) => {
              if (!isSelected) {
                event.currentTarget.style.background = "var(--ds-gray-alpha-100)";
              }
            }
          : undefined,
        onMouseLeave: selectableLines
          ? (event) => {
              if (!isSelected) {
                event.currentTarget.style.background = "transparent";
              }
            }
          : undefined,
      };
    },
    [handleToggleLine, isDark, selectableLines, selectedLines],
  );

  return (
    <div className="md-code-surface">
      <SyntaxHighlighter
        language={language}
        style={codeTheme}
        PreTag="div"
        showLineNumbers={showLineNumbers}
        wrapLines
        lineNumberStyle={showLineNumbers ? lineNumberStyle : undefined}
        lineProps={lineProps}
        customStyle={{
          margin: 0,
          padding,
          background: "transparent",
          fontSize: "inherit",
          fontWeight: 500,
          lineHeight: "inherit",
          fontStyle: "normal",
        }}
        codeTagProps={{
          style: {
            fontFamily: CODE_FONT_FAMILY,
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

export function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
    }
  }, [code]);

  const lang = language || "text";

  return (
    <div className="my-3 overflow-hidden rounded-md border border-gray-alpha-400 bg-background-100">
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
            className="text-ds-text-tertiary hover:text-ds-text"
          >
            {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
          </Button>
        </Tooltip>
      </div>

      {/* Code body */}
      <CodeSurface language={lang} code={code} />
    </div>
  );
}