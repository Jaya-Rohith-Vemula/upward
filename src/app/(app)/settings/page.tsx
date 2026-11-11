import { SettingsForm, CategoryEditor } from "@/components/settings-forms";
import { getCategories, getSettings } from "@/lib/data";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [settings, categories] = await Promise.all([getSettings(), getCategories(true)]);
  return (
    <div className="max-w-3xl">
      <header className="rise">
        <p className="eyebrow">How the ledger works</p>
        <h1 className="display mt-1 text-5xl leading-none">Settings</h1>
      </header>
      <SettingsForm initial={settings} />
      <CategoryEditor categories={categories} />
    </div>
  );
}
