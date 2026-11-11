import { ProjectsBoard } from "@/components/projects-board";
import { getProjects, getToday } from "@/lib/data";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const [projects, { today }] = await Promise.all([getProjects(), getToday()]);
  return <ProjectsBoard initial={projects} today={today} />;
}
