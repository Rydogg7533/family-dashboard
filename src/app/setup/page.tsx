import SetupForm from "@/components/c/SetupForm";
import { getSetupState } from "@/lib/setup-state";

export const dynamic = "force-dynamic";

// First run (onboarding Stage 1, step 2). Reachable without a login, but it does nothing once anyone has a profile: the page and the
// action both check the database first. There is no way back in after that.
export default async function Setup() {
  let state: Awaited<ReturnType<typeof getSetupState>> | "error" = "error"; let detail = "";
  try { state = await getSetupState(); } catch (e) { detail = e instanceof Error ? e.message : String(e); }
  const wrap = (children: React.ReactNode) => <div className="pt-10"><h1 className="text-3xl mb-1">StewardOS</h1>{children}</div>;
  if (state === "done") return wrap(<><p className="text-muted mb-6">This household is already set up.</p><a href="/login" className="inline-grid min-h-12 px-6 place-items-center rounded-xl bg-accent text-white font-semibold">Sign in</a></>);
  if (state === "no-service") return wrap(<p className="text-muted">The app has no service key (SUPABASE_SERVICE_ROLE_KEY), so it cannot set up the household. Add it to the Vercel environment and redeploy.</p>);
  if (state === "error") return wrap(<p className="text-muted">Could not reach the database: {detail}. Check NEXT_PUBLIC_SUPABASE_URL and the keys in the Vercel environment.</p>);
  if (state === "no-schema") return wrap(
    <>
      <p className="text-muted mb-4">Step 1 of 2: give the database its tables.</p>
      <ol className="list-decimal pl-5 text-sm flex flex-col gap-2 mb-4">
        <li><a href="/setup/schema.sql" className="font-semibold text-accent">Download the schema file</a> (one .sql file).</li>
        <li>In your Supabase project, open <b>SQL Editor</b>, paste the whole file, and press <b>Run</b>. It takes a few seconds.</li>
        <li>Come back here and reload. Step 2 appears when the tables exist.</li>
      </ol>
      <a href="/setup" className="inline-grid min-h-12 px-6 place-items-center rounded-xl bg-accent text-white font-semibold">Check again</a>
      <p className="text-xs text-muted mt-4">The schema creates the tables and the rules that keep each person’s rows private. It stores no data of yours.</p>
    </>
  );
  return wrap(
    <>
      <p className="text-muted mb-4">Step 2 of 2: name the household and its parents.</p>
      <SetupForm defaultTz="America/Denver" />
    </>
  );
}
