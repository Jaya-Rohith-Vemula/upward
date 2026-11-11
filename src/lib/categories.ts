/** The category whose entries can be tagged with a specific project. Matched by name: "Project" or "Projects". */
export const isProjectsCategory = (name: string | null | undefined) => !!name && /^projects?$/i.test(name.trim());
