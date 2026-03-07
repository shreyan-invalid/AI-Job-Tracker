import type { LayoutType } from "@/lib/resumeParser/detectLayout";
import type { ResumeSections } from "@/lib/resumeParser/detectSections";
import type { ExtractedEntities } from "@/lib/resumeParser/extractEntities";

export type StructuredResume = {
  name: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  sections: ResumeSections;
  layout: LayoutType;
};

type BuildStructuredResumeInput = {
  entities: ExtractedEntities;
  skills: string[];
  sections: ResumeSections;
  layout: LayoutType;
};

export function buildStructuredResume(input: BuildStructuredResumeInput): StructuredResume {
  return {
    name: input.entities.name,
    email: input.entities.email,
    phone: input.entities.phone,
    skills: input.skills,
    sections: input.sections,
    layout: input.layout
  };
}
