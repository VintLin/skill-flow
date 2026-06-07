export type ParsedSkillFrontmatter = {
  data: Record<string, string>;
  bodyStartLine: number;
};

export function parseSkillFrontmatter(raw: string): ParsedSkillFrontmatter | undefined {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return undefined;
  }

  const data: Record<string, string> = {};
  let index = 1;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "---") {
      return { data, bodyStartLine: index + 1 };
    }

    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) {
      index += 1;
      continue;
    }

    const key = pair[1];
    const rest = pair[2];
    if (!key || rest === undefined) {
      index += 1;
      continue;
    }

    if (rest === "|" || rest === ">") {
      const blockLines: string[] = [];
      index += 1;
      while (index < lines.length) {
        const blockLine = lines[index] ?? "";
        if (blockLine.length === 0) {
          blockLines.push("");
          index += 1;
          continue;
        }
        if (!blockLine.startsWith("  ")) {
          break;
        }
        blockLines.push(blockLine.slice(2));
        index += 1;
      }
      data[key] = blockLines.join("\n").trim();
      continue;
    }

    data[key] = parseSkillFrontmatterScalar(rest);
    index += 1;
  }

  return undefined;
}

export function parseSkillFrontmatterScalar(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }

  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    return trimmed
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, "\"")
      .replace(/\\\\/g, "\\");
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }

  return trimmed;
}
