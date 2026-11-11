import { TodosList } from "@/components/todos-list";
import { getProjectOptions, getToday, getTodos } from "@/lib/data";

export const metadata = { title: "To-dos" };

export default async function TodosPage() {
  const [todos, projects, { today }] = await Promise.all([getTodos(), getProjectOptions(), getToday()]);
  return <TodosList initial={todos} projects={projects} today={today} />;
}
