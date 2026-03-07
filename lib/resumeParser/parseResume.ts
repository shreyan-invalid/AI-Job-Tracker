import { buildStructuredResume, type StructuredResume } from "@/lib/resumeParser/buildStructuredResume";
import { cleanText } from "@/lib/resumeParser/cleanText";
import { detectLayout, type LayoutType } from "@/lib/resumeParser/detectLayout";
import { detectSections } from "@/lib/resumeParser/detectSections";
import { extractEntities } from "@/lib/resumeParser/extractEntities";
import { extractSkills } from "@/lib/resumeParser/extractSkills";
import { extractText, type ResumeFileType } from "@/lib/resumeParser/extractText";
import { normalizeColumns } from "@/lib/resumeParser/normalizeColumns";

export type ParseResumeResult = {
  parsedText: string;
  skills: string[];
  layout: LayoutType;
  structuredData: StructuredResume;
};

export async function parseResume(buffer: Buffer, fileType: ResumeFileType): Promise<ParseResumeResult> {
  try {
    const extracted = await extractText(buffer, fileType);

    const layoutDetails = detectLayout(extracted.blocks);
    const normalized = normalizeColumns(extracted, layoutDetails);
    const parsedText = cleanText(normalized.normalizedText);

    const sections = detectSections(parsedText);
    const entities = extractEntities(parsedText);
    const skills = extractSkills(parsedText, sections);

    const structuredData = buildStructuredResume({
      entities,
      skills,
      sections,
      layout: layoutDetails.layout
    });

    return {
      parsedText,
      skills,
      layout: layoutDetails.layout,
      structuredData
    };
  } catch (error) {
    console.error("parseResume pipeline error", error);
    throw new Error("Failed to parse resume");
  }
}
