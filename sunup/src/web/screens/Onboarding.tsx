import { useState } from 'react';
import { ArrowLeft, Bell, Check, Share2, UserPlus, Users } from 'lucide-react';
import type { Snapshot } from '../../shared/snapshot';
import { formatHM, firstName } from '../../shared/util';
import { ApiError, type Api, type CodeSent, type InviteInfo } from '../store/api';
import { useStore } from '../store/StoreContext';
import { Avatar, SunMark, Toggle } from '../components/ui';
import { CodeInput } from '../components/CodeInput';
import { HAS_SITE } from '../lib/format';

const PRESETS = [
  { label: 'Early bird', start: '06:00', deadline: '09:00' },
  { label: 'Most people', start: '07:00', deadline: '10:00' },
  { label: 'Late riser', start: '09:00', deadline: '12:00' },
];

type WelcomeStep = 'hello' | 'name' | 'login' | 'code';

/** Before there's an account: the pitch, then name and number (confirmed by a texted code in server mode). */
export function Welcome({ api, invite, onSignedUp }: { api: Api; invite: InviteInfo | null; onSignedUp: (snap: Snapshot) => void }) {
  const [step, setStep] = useState<WelcomeStep>('hello');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<CodeSent | null>(null);
  /** A code already proven correct, waiting for a name to create the account. */
  const [provenCode, setProvenCode] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const auth = api.auth;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Something went wrong.');
    }
    setBusy(false);
  }

  const sendCode = () =>
    run(async () => {
      setSent(await auth!.start(phone));
      setCode('');
      setStep('code');
    });

  async function submitName(e: React.FormEvent) {
    e.preventDefault();
    if (auth && provenCode) {
      return run(async () => {
        const res = await auth.verify({ phone, code: provenCode, name, timezone });
        if (res.snapshot) onSignedUp(res.snapshot);
      });
    }
    if (auth && phone.trim()) return sendCode();
    return run(async () => onSignedUp(await api.signup({ name, phone: phone || undefined, timezone })));
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    return run(async () => {
      const res = await auth!.verify({ phone, code, name: name.trim() || undefined, timezone });
      if (res.snapshot) return onSignedUp(res.snapshot);
      if (res.needsName) {
        setProvenCode(code);
        setNotice('There\'s no Sunup account for that number yet. Add your name to create one.');
        setStep('name');
      }
    });
  }

  const back = (to: WelcomeStep) => (
    <button
      type="button"
      className="icon-btn back"
      onClick={() => {
        setError('');
        setStep(to);
      }}
      aria-label="Back"
    >
      <ArrowLeft size={20} />
    </button>
  );

  if (step === 'hello') {
    return (
      <div className="onboard welcome">
        <div className="welcome-art" aria-hidden="true">
          <div className="welcome-sun" />
          <div className="welcome-horizon" />
        </div>
        <div className="welcome-copy">
          <div className="brand">
            <SunMark size={30} /> Sunup
          </div>
          <h1 className="display xl">If something happened to you today, who would know?</h1>
          <p className="lead">One tap every morning tells the people who love you that you're okay. Miss it, and they find out fast.</p>
          {invite && (
            <div className="invite-banner">
              <Avatar name={invite.name} color={invite.color} size={36} />
              <span>
                <strong>{firstName(invite.name)}</strong> invited you to their circle.
              </span>
            </div>
          )}
          <button className="btn primary block lg" onClick={() => setStep('name')}>
            Get started
          </button>
          {auth && (
            <button className="btn ghost block" onClick={() => setStep('login')}>
              I already have an account
            </button>
          )}
          <p className="fine center">
            Free daily check-in and SOS. No location tracking, ever.
            {HAS_SITE && (
              <>
                {' '}
                <a href="terms.html">Terms</a> · <a href="privacy.html">Privacy</a>
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  if (step === 'login') {
    return (
      <form
        className="onboard step"
        onSubmit={(e) => {
          e.preventDefault();
          void sendCode();
        }}
      >
        {back('hello')}
        <h1 className="display">Welcome back</h1>
        <p className="muted">Enter the number on your account. We'll text you a code.</p>
        <label>
          <span>Mobile number</span>
          <input className="input lg" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" required autoFocus />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="btn primary block lg" type="submit" disabled={busy || !phone.trim()}>
          Text me a code
        </button>
      </form>
    );
  }

  if (step === 'code' && sent) {
    return (
      <form className="onboard step" onSubmit={submitCode}>
        {back(name ? 'name' : 'login')}
        <h1 className="display">Check your texts</h1>
        <CodeInput sent={sent} value={code} onChange={setCode} onResend={sendCode} />
        {error && <p className="error-text">{error}</p>}
        <button className="btn primary block lg" type="submit" disabled={busy || code.length !== 6}>
          Continue
        </button>
      </form>
    );
  }

  return (
    <form className="onboard step" onSubmit={submitName}>
      {back('hello')}
      <p className="eyebrow">Step 1 of 4</p>
      <h1 className="display">What should we call you?</h1>
      {notice && <p className="invite-banner">{notice}</p>}
      <label>
        <span>Your first name</span>
        <input className="input lg" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={40} required autoFocus />
      </label>
      {!provenCode && (
        <label>
          <span>Mobile number (recommended)</span>
          <input className="input lg" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
          <small className="fine">
            For alarm texts and the escalation call if you miss a check-in. Your circle can also call you from an alert.
            {auth && ' We\'ll text you a code to confirm it, and it\'s how you sign back in on a new phone.'}
          </small>
        </label>
      )}
      {error && <p className="error-text">{error}</p>}
      <button className="btn primary block lg" type="submit" disabled={busy || !name.trim()}>
        {auth && phone.trim() && !provenCode ? 'Text me a code' : 'Continue'}
      </button>
    </form>
  );
}

type SetupStep = 'invite' | 'window' | 'circle' | 'alerts';

/** After signup: invite, check-in window, first circle member, notifications. */
export function Setup({ invite, inviteCode, onInviteHandled }: { invite: InviteInfo | null; inviteCode: string | null; onInviteHandled: () => void }) {
  const { snap, run, api, attempt, toast } = useStore();
  const [step, setStep] = useState<SetupStep>(invite && inviteCode ? 'invite' : 'window');
  const [watch, setWatch] = useState(true);
  const [mutual, setMutual] = useState(true);
  const [slot, setSlot] = useState(snap.me.schedule.slots[0]);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [sample, setSample] = useState(api.mode === 'demo');
  const [busy, setBusy] = useState(false);

  async function joinCircle() {
    setBusy(true);
    const ok = !watch && !mutual ? true : await run({ type: 'acceptInvite', code: inviteCode!, watch, mutual });
    setBusy(false);
    if (ok) {
      onInviteHandled();
      setStep('window');
    }
  }

  async function saveWindow() {
    setBusy(true);
    const ok = await run({ type: 'setSchedule', schedule: { ...snap.me.schedule, slots: [slot] } });
    setBusy(false);
    if (ok) setStep('circle');
  }

  async function saveCircle(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    let ok = true;
    if (contactName.trim() || contactPhone.trim()) {
      ok = await run({ type: 'addContact', name: contactName, phone: contactPhone, receivesPacket: true });
    }
    if (ok && sample && api.demo && !api.demo.hasSampleCircle()) ok = await attempt(() => api.demo!.addSampleCircle());
    setBusy(false);
    if (ok) setStep('alerts');
  }

  async function shareInvite() {
    const url = api.inviteUrl(snap.me.inviteCode);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join my Sunup circle', text: 'Join my Sunup circle so you know I\'m okay each morning:', url });
        return;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Invite link copied', tone: 'ok' });
    } catch {
      toast({ title: 'Copy this link', body: url, tone: 'info' });
    }
  }

  async function finish(enable: boolean) {
    if (enable) await api.enablePush();
    await run({ type: 'completeOnboarding' });
  }

  if (step === 'invite' && invite) {
    const name = firstName(invite.name);
    return (
      <div className="onboard step">
        <p className="eyebrow">Step 1 of 4</p>
        <h1 className="display">Join {name}'s circle</h1>
        <div className="invite-banner big">
          <Avatar name={invite.name} color={invite.color} size={52} />
          <span>{name} wants the two of you to look out for each other.</span>
        </div>
        <label className="row-toggle card pad">
          <span>
            <strong>I'll watch over {name}</strong>
            <small>See {name}'s check-ins, and get alerted if {name} goes quiet.</small>
          </span>
          <Toggle checked={watch} onChange={setWatch} label={`Watch over ${name}`} />
        </label>
        <label className="row-toggle card pad">
          <span>
            <strong>{name} watches over me</strong>
            <small>{name} gets alerted if you miss your check-in.</small>
          </span>
          <Toggle checked={mutual} onChange={setMutual} label={`${name} watches over me`} />
        </label>
        <button className="btn primary block lg" onClick={joinCircle} disabled={busy}>
          {watch || mutual ? 'Join circle' : 'Skip'}
        </button>
      </div>
    );
  }

  if (step === 'window') {
    return (
      <div className="onboard step">
        <p className="eyebrow">Step 2 of 4</p>
        <h1 className="display">When are you usually up?</h1>
        <p className="muted">Check in any time in your window. If you haven't by the end, Sunup starts checking on you.</p>
        <div className="presets">
          {PRESETS.map((p) => {
            const on = p.start === slot.start && p.deadline === slot.deadline;
            return (
              <button key={p.label} className={`preset${on ? ' on' : ''}`} onClick={() => setSlot({ start: p.start, deadline: p.deadline })}>
                <strong>{p.label}</strong>
                <span>
                  {formatHM(p.start)} to {formatHM(p.deadline)}
                </span>
                {on && <Check size={18} />}
              </button>
            );
          })}
        </div>
        <div className="slot-row">
          <label>
            <span>From</span>
            <input className="input" type="time" value={slot.start} onChange={(e) => e.target.value && setSlot({ ...slot, start: e.target.value })} />
          </label>
          <label>
            <span>Check in by</span>
            <input className="input" type="time" value={slot.deadline} onChange={(e) => e.target.value && setSlot({ ...slot, deadline: e.target.value })} />
          </label>
        </div>
        <button className="btn primary block lg" onClick={saveWindow} disabled={busy}>
          Continue
        </button>
      </div>
    );
  }

  if (step === 'circle') {
    return (
      <form className="onboard step" onSubmit={saveCircle}>
        <p className="eyebrow">Step 3 of 4</p>
        <h1 className="display">Who should we tell if you go quiet?</h1>
        <p className="muted">Add someone by phone. They don't need the app. We'll text them to confirm, and if you ever go quiet, Sunup texts them, then calls.</p>
        {snap.watchers.length > 0 && (
          <div className="invite-banner">
            <Users size={18} /> Already in your circle: {snap.watchers.map((w) => firstName(w.name)).join(', ')}
          </div>
        )}
        <label>
          <span>Their name</span>
          <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Mom, Alex, roommate…" maxLength={40} />
        </label>
        <label>
          <span>Their mobile number</span>
          <input className="input" type="tel" inputMode="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="(555) 123-4567" />
        </label>
        <button type="button" className="btn ghost block" onClick={shareInvite}>
          <Share2 size={18} /> Or send an invite link instead
        </button>
        {api.demo && (
          <label className="row-toggle card pad">
            <span>
              <strong>Add a sample circle</strong>
              <small>Mom and Jordan are simulated people who check in each morning, so you can try both sides of Sunup.</small>
            </span>
            <Toggle checked={sample} onChange={setSample} label="Add a sample circle" />
          </label>
        )}
        <button className="btn primary block lg" type="submit" disabled={busy}>
          <UserPlus size={18} /> {contactName.trim() || contactPhone.trim() || sample ? 'Continue' : 'Skip for now'}
        </button>
      </form>
    );
  }

  return (
    <div className="onboard step">
      <p className="eyebrow">Step 4 of 4</p>
      <div className="bell-art">
        <Bell size={40} />
      </div>
      <h1 className="display">Turn on alerts</h1>
      <p className="muted">
        Sunup reminds you before your window closes, and tells you right away if someone in your circle needs you. On iPhone, add Sunup to your Home Screen
        first (Share, then Add to Home Screen).
      </p>
      <button className="btn primary block lg" onClick={() => finish(true)}>
        Turn on alerts
      </button>
      <button className="btn ghost block" onClick={() => finish(false)}>
        Not now
      </button>
    </div>
  );
}
