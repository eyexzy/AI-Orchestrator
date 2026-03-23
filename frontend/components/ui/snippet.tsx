"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
  SyntaxHighlighter,
  createCodeTheme,
  CODE_FONT_FAMILY,
} from "@/components/ui/code-block";

export function Snippet({
  children,
  language = "bash",
}: {
  children: string;
  language?: string;
}) {
  const { resolvedTheme } = useTheme();
  const [copied, setCopied] = useState(false);
  const isDark = resolvedTheme === "dark";

  const codeTheme = useMemo(
    () => createCodeTheme(isDark ? "dark" : "light"),
    [isDark],
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [children]);

  return (
    <div className="snippet">
      <span className="snippet-prompt">$</span>
      <div className="snippet-text">
        <SyntaxHighlighter
          language={language}
          style={codeTheme}
          PreTag="span"
          customStyle={{
            margin: 0,
            padding: 0,
            background: "transparent",
            fontSize: "inherit",
            fontWeight: 500,
            lineHeight: "inherit",
            fontStyle: "normal",
            whiteSpace: "nowrap",
            display: "block",
          }}
          codeTagProps={{
            style: {
              fontFamily: CODE_FONT_FAMILY,
              fontWeight: 500,
              fontStyle: "normal",
            },
          }}
        >
          {children}
        </SyntaxHighlighter>
      </div>
      <Tooltip content={copied ? "Copied!" : "Copy command"}>
        <Button
          variant="tertiary"
          size="sm"
          iconOnly
          onClick={handleCopy}
          aria-label="Copy command"
          className="shrink-0"
        >
          {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
        </Button>
      </Tooltip>
    </div>
  );
}