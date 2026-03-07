import mammoth from "mammoth";
import pdfParse from "pdf-parse";

export type ResumeFileType = "pdf" | "docx";

export type TextBlock = {
  text: string;
  x: number;
  y: number;
  page: number;
};

export type ExtractTextResult = {
  rawText: string;
  blocks: TextBlock[];
};

type PdfTextItem = {
  str?: string;
  transform?: number[];
};

function cleanValue(text: string): string {
  return text.replace(/\u0000/g, " ").replace(/\s+/g, " ").trim();
}

function blocksToText(blocks: TextBlock[]): string {
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
    const changedPage = block.page !== lastPage;
    const changedLine = Math.abs(block.y - lastY) > 2.5;

    if (changedPage || changedLine) {
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

async function extractPdfText(buffer: Buffer): Promise<ExtractTextResult> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdfjsAny = pdfjs as any;

    if (pdfjsAny.GlobalWorkerOptions) {
      pdfjsAny.GlobalWorkerOptions.workerSrc = "";
    }

    const loadingTask = pdfjsAny.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
      useWorkerFetch: false,
      isEvalSupported: false
    });
    const document = await loadingTask.promise;
    const blocks: TextBlock[] = [];

    for (let page = 1; page <= document.numPages; page += 1) {
      const pdfPage = await document.getPage(page);
      const content = await pdfPage.getTextContent();
      const items = content.items as PdfTextItem[];

      for (const item of items) {
        const text = cleanValue(item.str ?? "");
        const transform = item.transform ?? [0, 0, 0, 0, 0, 0];

        if (!text) {
          continue;
        }

        blocks.push({
          text,
          x: transform[4] ?? 0,
          y: transform[5] ?? 0,
          page
        });
      }
    }

    const rawText = blocksToText(blocks);
    return { rawText, blocks };
  } catch (error) {
    // Fallback to pdf-parse if coordinate extraction fails.
    console.warn("pdfjs-dist extraction failed, falling back to pdf-parse", error);
    const parsed = await pdfParse(buffer);
    return {
      rawText: parsed.text ?? "",
      blocks: []
    };
  }
}

async function extractDocxText(buffer: Buffer): Promise<ExtractTextResult> {
  const parsed = await mammoth.extractRawText({ buffer });
  const rawText = parsed.value ?? "";

  const blocks = rawText
    .split("\n")
    .map((line) => cleanValue(line))
    .filter(Boolean)
    .map((text, index) => ({
      text,
      x: 0,
      y: -index,
      page: 1
    }));

  return { rawText, blocks };
}

export async function extractText(buffer: Buffer, fileType: ResumeFileType): Promise<ExtractTextResult> {
  if (fileType === "pdf") {
    return extractPdfText(buffer);
  }

  if (fileType === "docx") {
    return extractDocxText(buffer);
  }

  throw new Error(`Unsupported file type: ${fileType}`);
}
