import { LoginForm } from "./form";

export const metadata = { title: "Unlock" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="rise w-full max-w-xs">
        <p className="display text-4xl italic">Upward<span className="text-accent">.</span></p>
        <p className="mt-2 text-sm text-muted">Private ledger. Enter your passphrase.</p>
        <LoginForm next={next ?? "/"} />
      </div>
    </main>
  );
}
