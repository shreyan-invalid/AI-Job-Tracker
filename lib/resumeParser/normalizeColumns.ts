import type { ExtractTextResult, TextBlock } from "@/lib/resumeParser/extractText";
import type { LayoutDetectionResult } from "@/lib/resumeParser/detectLayout";

export type NormalizedColumnsResult = {
  normalizedText: string;
  leftColumn: TextBlock[];
  rightColumn: TextBlock[];
};

function blocksToLineText(blocks: TextBlock[]): string {
  if (blocks.length === 0) {
    return "";
  }

  const sorted = [...blocks].sort((a, b) => {
    if (a.page !== b.page) {
      return a.page - b.page;
    }

    if (Math.abs(a.y - b.y) > 2.5) {
      return b.y - a.y;
    }

    return a.x - b.x;
  });

  const lines: string[] = [];
  let currentLine = "";
  let lastPage = sorted[0].page;
  let lastY = sorted[0].y;

  for (const block of sorted) {
    const newPage = block.page !== lastPage;
    const newLine = Math.abs(block.y - lastY) > 2.5;

    if (newPage || newLine) {
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }
      currentLine = block.text;
      lastPage = block.page;
      lastY = block.y;
    } else {
      currentLine = `${currentLine} ${block.text}`;
    }
  }

  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  return lines.join("\n");
}

export function normalizeColumns(
  extracted: ExtractTextResult,
  layout: LayoutDetectionResult
): NormalizedColumnsResult {
  if (layout.layout === "single-column" || !layout.splitX || extracted.blocks.length === 0) {
    return {
      normalizedText: extracted.rawText,
      leftColumn: extracted.blocks,
      rightColumn: []
    };
  }

  const leftColumn = extracted.blocks.filter((block) => block.x <= layout.splitX!);
  const rightColumn = extracted.blocks.filter((block) => block.x > layout.splitX!);

  const leftText = blocksToLineText(leftColumn);
  const rightText = blocksToLineText(rightColumn);

  return {
    normalizedText: [leftText, rightText].filter(Boolean).join("\n\n"),
    leftColumn,
    rightColumn
  };
}
