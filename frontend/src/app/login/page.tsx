import { getAuthConfig } from "../../lib/auth-session";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
    next?: string;
  }>;
};

function errorText(error?: string) {
  if (error === "configuration") {
    return "The service sign-in is not configured. Please contact support.";
  }
  if (error === "invalid") {
    return "The sign-in details were not accepted.";
  }
  return "";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const config = getAuthConfig();
  const message = errorText(params.error);

  return (
    <main className="loginPage">
      <section className="loginPanel" aria-labelledby="login-title">
        <div className="loginBrand">
          <img alt="" height="40" src="/carecall-logo.svg" width="40" />
          <span>
            <span className="brandName">Care Call AI</span>
            <span className="brandSub">Coordinator console</span>
          </span>
        </div>
        <h1 id="login-title">Operator sign in</h1>
        <p>Access is limited to authorized coordinators preparing CALL-E care rounds.</p>
        <form action="/api/auth/login" className="loginForm" method="post">
          <input name="next" type="hidden" value={params.next?.startsWith("/dashboard") ? params.next : "/dashboard"} />
          <label>
            <span>Operator ID</span>
            <input autoComplete="username" defaultValue={config.configured ? "" : config.username} name="username" required />
          </label>
          <label>
            <span>Password</span>
            <input autoComplete="current-password" name="password" required type="password" />
          </label>
          {message && <p className="errorText" role="alert">{message}</p>}
          <button className="button" type="submit">Sign in</button>
        </form>
      </section>
    </main>
  );
}
