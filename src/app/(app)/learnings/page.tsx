import { redirect } from "next/navigation";
import { ProjectsBoard } from "@/components/projects-board";
import { getProjects, getToday } from "@/lib/data";

export const metadata = { title: "Learnings" };

export default async function LearningsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const [projects, { today }, { p }] = await Promise.all([getProjects(), getToday(), searchParams]);
  if (p && projects.find((c) => c.id === Number(p))?.type === "build") redirect(`/projects?p=${p}`);
  return <ProjectsBoard initial={projects} today={today} type="learn" />;
}
