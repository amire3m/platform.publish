import LoginForm from "./form";

export const dynamic = "force-dynamic";

// Server wrapper: injects the native-form ?err= flag as a plain prop so the
// login form (including the no-JS code path) is fully server-rendered into
// the HTML with zero client hooks standing in the way.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const sp = await searchParams;
  return <LoginForm initialErr={sp?.err ?? null} />;
}
