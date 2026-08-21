export default function Home() {
  return (
    <main className="publicPage entryPage">
      <section className="entryHero" aria-labelledby="entry-title">
        <img className="entryLogo" alt="Care Call AI logo" src="/carecall-logo-full.svg" />
        <p className="entryEyebrow">Care Call AI</p>
        <h1 id="entry-title">Care seen. Needs heard. Help delivered.</h1>
        <p className="entryCopy">
          Safe CALL-E check-ins that turn conversations with vulnerable people into practical care requests.
        </p>
        <div className="entryActions" aria-label="Care Call AI actions">
          <a className="button entryPrimary" href="/login">Login</a>
          <a className="button secondary" href="/support">Support</a>
        </div>
        <nav className="entryLinks" aria-label="Legal links">
          <a href="/privacy">Privacy policy</a>
          <a href="/terms">Terms and conditions</a>
        </nav>
      </section>
      <footer className="publicFooter">© 2026 Alex Raixon. All rights reserved.</footer>
    </main>
  );
}
