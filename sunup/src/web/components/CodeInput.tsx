import { useEffect, useState } from 'react';
import type { CodeSent } from '../store/api';

interface OtpCredential extends Credential {
  code: string;
}

/** The 6-digit code field: autofills from the text where the browser supports it, with a resend timer. */
export function CodeInput({ sent, value, onChange, onResend }: { sent: CodeSent; value: string; onChange: (code: string) => void; onResend: () => Promise<void> }) {
  const [wait, setWait] = useState(30);

  useEffect(() => {
    setWait(30);
    const id = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(id);
  }, [sent]);

  // Android Chrome can read the code straight from the text (WebOTP).
  useEffect(() => {
    if (!('OTPCredential' in window)) return;
    const abort = new AbortController();
    navigator.credentials
      .get({ otp: { transport: ['sms'] }, signal: abort.signal } as CredentialRequestOptions)
      .then((cred) => cred && onChange((cred as OtpCredential).code))
      .catch(() => undefined);
    return () => abort.abort();
  }, [sent, onChange]);

  return (
    <div className="code-entry">
      <label>
        <span>Code texted to {sent.sentTo}</span>
        <input
          className="input lg code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="••••••"
          autoFocus
          required
        />
      </label>
      {sent.devCode && <p className="fine">Texting isn't set up on this server yet, so here's the code: {sent.devCode}</p>}
      <button type="button" className="link" disabled={wait > 0} onClick={onResend}>
        {wait > 0 ? `Text me a new code in ${wait}s` : 'Text me a new code'}
      </button>
    </div>
  );
}
