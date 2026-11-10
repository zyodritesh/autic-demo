import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../state/auth';

export function LoginPage() {
  const { session, login } = useAuth();
  const [mobile, setMobile] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [factories, setFactories] = useState<Array<{ id: string; name: string }> | null>(null);

  if (session) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent, factoryId?: string) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await login(mobile.trim(), pin.trim(), factoryId);
      if (result.needsFactoryChoice && result.factories) {
        setFactories(result.factories);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={(e) => onSubmit(e)}>
        <h1>Manniaques</h1>
        <p className="muted">Wholesale garment ERP · staff login</p>
        {error ? <div className="banner error">{error}</div> : null}
        <div className="field">
          <label htmlFor="mobile">Mobile</label>
          <input
            id="mobile"
            inputMode="numeric"
            autoComplete="username"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="pin">PIN</label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </div>
        {factories ? (
          <div className="list" style={{ marginBottom: 14 }}>
            <p className="muted">Choose factory</p>
            {factories.map((f) => (
              <button
                key={f.id}
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={(e) => onSubmit(e as unknown as FormEvent, f.id)}
              >
                {f.name}
              </button>
            ))}
          </div>
        ) : (
          <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        )}
      </form>
    </div>
  );
}
