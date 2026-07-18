type MarkdownDocumentProps = {
  content: string;
};

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "code"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] };

export function MarkdownDocument({ content }: MarkdownDocumentProps) {
  const blocks = parseMarkdown(content);

  return (
    <div className="space-y-5 text-sm leading-7 text-zinc-200">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const className =
            block.level === 1
              ? "text-2xl font-semibold text-white"
              : block.level === 2
                ? "text-xl font-semibold text-white"
                : "text-base font-semibold uppercase tracking-[0.2em] text-cyan-200";
          const Heading = `h${Math.min(block.level, 3)}` as "h1" | "h2" | "h3";
          return (
            <Heading key={`${block.type}-${index}`} className={className}>
              {block.text}
            </Heading>
          );
        }

        if (block.type === "list") {
          return (
            <ul key={`${block.type}-${index}`} className="space-y-2">
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`} className="flex gap-3">
                  <span className="mt-3 h-1.5 w-1.5 flex-none rounded-full bg-cyan-200/70" />
                  <span>{renderInline(item)}</span>
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === "code") {
          return (
            <pre
              key={`${block.type}-${index}`}
              className="overflow-x-auto rounded-2xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-zinc-200"
            >
              <code>{block.text}</code>
            </pre>
          );
        }

        if (block.type === "table") {
          return (
            <div
              key={`${block.type}-${index}`}
              className="overflow-x-auto rounded-2xl border border-white/10"
            >
              <table className="min-w-full divide-y divide-white/10 text-left text-xs">
                <thead className="bg-white/5 text-[11px] uppercase tracking-[0.2em] text-zinc-400">
                  <tr>
                    {block.headers.map((header) => (
                      <th key={header} className="px-4 py-3 font-semibold">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="bg-black/20">
                      {row.map((cell, cellIndex) => (
                        <td key={`${rowIndex}-${cellIndex}`} className="px-4 py-3 text-zinc-200">
                          {renderInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <p key={`${block.type}-${index}`} className="text-zinc-200">
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}

function parseMarkdown(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push({ type: "code", text: code.join("\n") });
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: stripInlineMarkdown(heading[2]),
      });
      index += 1;
      continue;
    }

    if (line.trim().startsWith("|") && (lines[index + 1] ?? "").includes("---")) {
      const tableLines: string[] = [];
      while (index < lines.length && (lines[index] ?? "").trim().startsWith("|")) {
        tableLines.push(lines[index] ?? "");
        index += 1;
      }
      const [headerLine, , ...rowLines] = tableLines;
      blocks.push({
        type: "table",
        headers: splitTableRow(headerLine),
        rows: rowLines.map(splitTableRow),
      });
      continue;
    }

    if (/^\s*-\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*-\s+/.test(lines[index] ?? "")) {
        items.push(stripInlineMarkdown((lines[index] ?? "").replace(/^\s*-\s+/, "")));
        index += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() &&
      !/^(#{1,6})\s+/.test(lines[index] ?? "") &&
      !/^\s*-\s+/.test(lines[index] ?? "") &&
      !(lines[index] ?? "").startsWith("```") &&
      !(lines[index] ?? "").trim().startsWith("|")
    ) {
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    blocks.push({ type: "paragraph", text: stripInlineMarkdown(paragraph.join(" ")) });
  }

  return blocks;
}

function splitTableRow(line = "") {
  return line
    .trim()
    .slice(1, -1)
    .split("|")
    .map((cell) => stripInlineMarkdown(cell.trim()));
}

function renderInline(value: string) {
  const parts = value.split(/(`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={`${part}-${index}`} className="rounded bg-white/10 px-1.5 py-0.5 text-cyan-100">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function stripInlineMarkdown(value = "") {
  return value.replace(/^\s*_Last refreshed:\s*([^_]+)_\s*$/, "Last refreshed: $1").trim();
}
