import type { PROJECT_TYPE } from "@/db/schema";

/** The category whose entries can be tagged with a specific project. Matched by name: "Project" or "Projects". */
export const isProjectsCategory = (name: string | null | undefined) => !!name && /^projects?$/i.test(name.trim());

/** The category whose entries can be tagged with a specific learning. Matched by name: "Learning" or "Learnings". */
export const isLearningCategory = (name: string | null | undefined) => !!name && /^learnings?$/i.test(name.trim());

/** Which kind of project a category's entries can be tagged with, if any. */
export const taggableType = (name: string | null | undefined): (typeof PROJECT_TYPE)[number] | null =>
  isProjectsCategory(name) ? "build" : isLearningCategory(name) ? "learn" : null;
