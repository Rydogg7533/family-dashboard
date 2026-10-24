export const dynamic = "force-dynamic";

// Placeholder landing page for the link sent in the pre-onboarding "you're ready" email. There's no real
// setup wizard yet — once it exists, point src/lib/preonboard-token.ts's onboardingLink() at it instead
// and this page can go away (or stay as a plain redirect).
export default function OnboardingSoon() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">You&apos;re all set</h1>
        <p className="text-muted">Thanks for finishing the pre-onboarding checklist. We&apos;ll reach out to schedule a time to walk through the rest together.</p>
      </div>
    </div>
  );
}
