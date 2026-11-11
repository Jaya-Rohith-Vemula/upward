import { DayView } from "@/components/day-view";
import { getCategories, getDay, getLoggedMinutesByDay, getProjectOptions, getToday } from "@/lib/data";
import { addDays, isValidDay, nowMinuteIn } from "@/lib/time";

export default async function DayPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  const { settings, today } = await getToday();
  const day = isValidDay(d) ? d : today;
  const weekFrom = addDays(day, -6);

  const [categories, { logs, reflection }, weekMap, projects] = await Promise.all([
    getCategories(true),
    getDay(day),
    getLoggedMinutesByDay(weekFrom, day),
    getProjectOptions(),
  ]);
  const week = Array.from({ length: 7 }, (_, i) => {
    const wd = addDays(weekFrom, i);
    return { day: wd, minutes: weekMap.get(wd) ?? 0 };
  });

  return (
    <DayView
      key={day}
      day={day}
      today={today}
      nowMinute={day === today ? nowMinuteIn(settings.timezone) : null}
      settings={settings}
      categories={categories}
      projects={projects}
      initialLogs={logs}
      reflection={reflection}
      week={week}
    />
  );
}
