import { redirect } from "next/navigation";
import { ProjectsBoard } from "@/components/projects-board";
import { getProjects, getToday } from "@/lib/data";

export const metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const [projects, { today }, { p }] = await Promise.all([getProjects(), getToday(), searchParams]);
  // Old deep links (/projects?p=12) may point at a learning; send them to the right board.
  if (p && projects.find((c) => c.id === Number(p))?.type === "learn") redirect(`/learnings?p=${p}`);
  return <ProjectsBoard initial={projects} today={today} type="build" />;
}
