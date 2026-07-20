import { Link } from 'react-router';

export function SetupRequired() {
  return (
    <main className="auth-page">
      <section className="setup-card">
        <span className="step-label">Workspace setup</span>
        <h1>Connect Supabase to open the document workspace</h1>
        <p>The public text demo still works. The private workspace needs your project URL and publishable key.</p>
        <div className="code-block" aria-label="Required environment variables">
          <code>VITE_SUPABASE_URL=your-project-url</code>
          <code>VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key</code>
        </div>
        <ol>
          <li>Run the migration from <code>supabase/migrations</code>.</li>
          <li>Add both variables to <code>frontend/.env.local</code>.</li>
          <li>Restart the frontend development server.</li>
        </ol>
        <Link className="secondary-link" to="/">Use the text brief demo</Link>
      </section>
    </main>
  );
}
