import { useEffect, useRef, useState } from 'react';
import { Check, MapPin, Phone, PhoneOff, Siren } from 'lucide-react';
import { PREMIUM_FEATURES, PRICE_MONTHLY, PRICE_YEARLY, TRIAL_DAYS } from '../../shared/plans';
import { Sheet, SunMark, Toggle } from './ui';
import { useStore } from '../store/StoreContext';
import { startRingtone } from '../lib/media';
import { CAN_PURCHASE } from '../native';

export function Paywall() {
  const { paywall, closePaywall, snap, run, api, attempt, toast } = useStore();
  const [yearly, setYearly] = useState(true);
  const trialUsed = !!snap.me.trialEndsAt;

  async function start() {
    if (api.billing) {
      try {
        await api.billing.checkout(yearly ? 'year' : 'month');
      } catch (e) {
        toast({ title: (e as Error).message, tone: 'error' });
      }
      return;
    }
    if (!trialUsed) {
      if (await run({ type: 'startTrial' })) {
        toast({ title: `Premium is on for ${TRIAL_DAYS} days`, body: 'Your full safety net is active.', tone: 'ok' });
        closePaywall();
      }
      return;
    }
    if (api.demo) {
      if (await attempt(() => api.demo!.setPlan('premium'))) {
        toast({ title: 'Welcome to Premium', tone: 'ok' });
        closePaywall();
      }
      return;
    }
    toast({ title: 'Payments aren\'t connected yet', body: 'This server doesn\'t take payments yet.', tone: 'info' });
  }

  // App-store builds without in-app purchasing: offer the free trial only.
  const canBuy = CAN_PURCHASE || !trialUsed;

  return (
    <Sheet open={paywall !== null} onClose={closePaywall} tall>
      <div className="paywall">
        <div className="paywall-art">
          <SunMark size={64} />
        </div>
        <h2 className="display">Sunup Premium</h2>
        <p className="muted center">{paywall || 'The full safety net, for you and everyone who worries about you.'}</p>
        <ul className="feature-list">
          {PREMIUM_FEATURES.map((f) => (
            <li key={f.title}>
              <span className="feature-check">
                <Check size={14} strokeWidth={3} />
              </span>
              <div>
                <strong>{f.title}</strong>
                <span>{f.detail}</span>
              </div>
            </li>
          ))}
        </ul>
        <div className="paywall-cta">
          {CAN_PURCHASE && (
            <div className="price-toggle" role="radiogroup" aria-label="Billing period">
              <button role="radio" aria-checked={!yearly} className={!yearly ? 'on' : ''} onClick={() => setYearly(false)}>
                <strong>${PRICE_MONTHLY}</strong>
                <span>per month</span>
              </button>
              <button role="radio" aria-checked={yearly} className={yearly ? 'on' : ''} onClick={() => setYearly(true)}>
                <em>Save 33%</em>
                <strong>${PRICE_YEARLY}</strong>
                <span>per year</span>
              </button>
            </div>
          )}
          {canBuy ? (
            <button className="btn primary block lg" onClick={start}>
              {trialUsed ? `Subscribe for $${yearly ? PRICE_YEARLY : PRICE_MONTHLY}` : `Start ${TRIAL_DAYS}-day free trial`}
            </button>
          ) : (
            <p className="muted center">Premium can't be purchased in this app yet.</p>
          )}
          <p className="fine center">
            {trialUsed
              ? CAN_PURCHASE
                ? 'Cancel anytime.'
                : ''
              : api.billing
                ? `Free for ${TRIAL_DAYS} days, then $${yearly ? `${PRICE_YEARLY}/year` : `${PRICE_MONTHLY}/month`}. You won't be charged before the trial ends. Cancel anytime.`
                : `Free for ${TRIAL_DAYS} days. No card needed, and nothing is charged when it ends.`}{' '}
            SOS and your daily check-in stay free forever.
          </p>
        </div>
      </div>
    </Sheet>
  );
}

export function SosSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { run, snap } = useStore();
  const [shareLocation, setShareLocation] = useState(true);
  const [progress, setProgress] = useState(0);
  const [sending, setSending] = useState(false);
  const timer = useRef<number | null>(null);
  const active = snap.myAlerts.find((a) => a.alert.kind === 'sos' && !a.alert.resolvedAt);
  const names = snap.watchers.map((w) => w.name.split(' ')[0]);

  useEffect(() => () => stop(), []);

  function stop() {
    if (timer.current) cancelAnimationFrame(timer.current);
    timer.current = null;
    setProgress(0);
  }

  function begin() {
    if (sending || names.length === 0) return;
    const started = performance.now();
    const step = () => {
      const p = Math.min(1, (performance.now() - started) / 1500);
      setProgress(p);
      if (p >= 1) {
        timer.current = null;
        void send();
      } else timer.current = requestAnimationFrame(step);
    };
    timer.current = requestAnimationFrame(step);
  }

  async function locate(): Promise<GeolocationPosition | null> {
    if (!shareLocation || !navigator.geolocation) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 6000, maximumAge: 60_000 });
    });
  }

  async function send() {
    setSending(true);
    navigator.vibrate?.(200);
    const pos = await locate();
    await run({
      type: 'sos',
      location: pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy } : undefined,
    });
    setSending(false);
    setProgress(0);
  }

  return (
    <Sheet open={open} onClose={onClose} title={active ? 'SOS sent' : 'Send SOS'}>
      {active ? (
        <div className="sos-sent">
          <p>
            Your circle has been alerted{active.alert.location ? ' with your location' : ''}. Stay where you are if it's safe.
          </p>
          <a className="btn danger block lg" href="tel:911">
            <Phone size={18} /> Call 911
          </a>
          <button className="btn block" onClick={() => run({ type: 'resolveAlert', id: active.alert.id })}>
            <Check size={18} /> I'm safe now
          </button>
        </div>
      ) : (
        <div className="sos">
          <p className="muted">
            {names.length
              ? `Hold the button to alert ${names.join(', ')} right away. Free on every plan.`
              : 'Add someone to your circle first so SOS has someone to reach.'}
          </p>
          <button
            className="sos-hold"
            style={{ ['--p' as string]: progress }}
            onPointerDown={begin}
            onPointerUp={stop}
            onPointerLeave={stop}
            onPointerCancel={stop}
            onContextMenu={(e) => e.preventDefault()}
            disabled={sending || names.length === 0}
          >
            <Siren size={34} />
            <span>{sending ? 'Sending…' : progress > 0 ? 'Keep holding' : 'Hold to send'}</span>
          </button>
          <label className="row-toggle">
            <span>
              <MapPin size={16} /> Include my location
            </span>
            <Toggle checked={shareLocation} onChange={setShareLocation} label="Include my location" />
          </label>
          <p className="fine center">
            In immediate danger? <a href="tel:911">Call 911</a>. Sunup isn't an emergency service.
          </p>
        </div>
      )}
    </Sheet>
  );
}

function callTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function FakeCall({ caller, onClose }: { caller: string; onClose: () => void }) {
  const [answered, setAnswered] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (answered) return;
    const stop = startRingtone();
    return stop;
  }, [answered]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fake-call" role="dialog" aria-label={`Incoming call from ${caller}`}>
      <div className="fake-call-top">
        <span className="fake-call-sub">{answered ? callTime(now - answered) : 'mobile'}</span>
        <h2>{caller}</h2>
        {!answered && <span className="fake-call-sub pulse-text">incoming call…</span>}
      </div>
      <div className="fake-call-actions">
        {answered ? (
          <button className="call-btn decline" onClick={onClose} aria-label="End call">
            <PhoneOff size={30} />
          </button>
        ) : (
          <>
            <button className="call-btn decline" onClick={onClose} aria-label="Decline">
              <PhoneOff size={30} />
            </button>
            <button className="call-btn accept" onClick={() => setAnswered(Date.now())} aria-label="Accept">
              <Phone size={30} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
