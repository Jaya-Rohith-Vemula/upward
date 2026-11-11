"use client";

import "@blocknote/mantine/style.css";
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView, type Theme } from "@blocknote/mantine";

// Text-only: drop media/file blocks. Remaining: paragraph, heading, bullet/numbered/check/toggle lists,
// quote, code block, divider, table. Type "/" for the block menu, or Markdown shortcuts (#, -, 1., [], >).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { audio, image, video, file, ...textBlocks } = defaultBlockSpecs;
export const editorSchema = BlockNoteSchema.create({ blockSpecs: textBlocks });

// Theme colors reference the app's CSS variables, so one theme serves light and dark.
const theme: Theme = {
  colors: {
    editor: { text: "var(--ink)", background: "transparent" },
    menu: { text: "var(--ink)", background: "var(--paper)" },
    tooltip: { text: "var(--paper)", background: "var(--ink)" },
    hovered: { text: "var(--ink)", background: "var(--paper-2)" },
    selected: { text: "var(--paper)", background: "var(--ink)" },
    disabled: { text: "var(--muted)", background: "var(--paper-2)" },
    shadow: "var(--rule-strong)",
    border: "var(--rule)",
    sideMenu: "var(--muted)",
  },
  borderRadius: 6,
  fontFamily: "var(--font-instrument), ui-sans-serif, system-ui, sans-serif",
};

export type RichEditorProps = {
  initial?: unknown;
  editable?: boolean;
  placeholder?: string;
  onChange?: (doc: unknown[], markdown: string) => void;
  className?: string;
};

export default function RichEditor({ initial, editable = true, placeholder, onChange, className }: RichEditorProps) {
  const editor = useCreateBlockNote({
    schema: editorSchema,
    initialContent: Array.isArray(initial) && initial.length ? (initial as never) : undefined,
    placeholders: { default: placeholder ?? "Type '/' for headings, lists, toggles, checklists…", emptyDocument: placeholder },
    animations: false,
  });
  return (
    <BlockNoteView
      editor={editor}
      editable={editable}
      theme={{ light: theme, dark: theme }}
      className={`upward-editor ${className ?? ""}`}
      onChange={() => onChange?.(editor.document, editor.blocksToMarkdownLossy(editor.document))}
    />
  );
}
