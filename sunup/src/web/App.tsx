import { useEffect, useState } from 'react';
import { CircleUser, KeyRound, Sun, Timer, Users, X } from 'lucide-react';
import type { Snapshot } from '../shared/snapshot';
import { firstName } from '../shared/util';
import type { Api, InviteInfo } from './store/api';
import { StoreProvider, useStore } from './store/StoreContext';
import { Avatar, Sheet, SunMark, Toggle } from './components/ui';
import { Paywall, SosSheet } from './components/overlays';
import { Setup, Welcome } from './screens/Onboarding';
import { Today } from './screens/Today';
import { Circle } from './screens/Circle';
import { Moments } from './screens/Moments';
import { Vault } from './screens/Vault';
import { You } from './screens/You';

type Tab = 'today' | 'circle' | 'moments' | 'vault' | 'you';
const TABS: { id: Tab; label: string; icon: typeof Sun }[] = [
  { id: 'today', label: 'Today', icon: Sun },
  { id: 'circle', label: 'Circle', icon: Users },
  { id: 'moments', label: 'Moments', icon: Timer },
  { id: 'vault', label: 'If I go dark', icon: KeyRound },
  { id: 'you', label: 'You', icon: CircleUser },
];

function readJoinCode(): string | null {
  return new URLSearchParams(location.search).get('join');
}

function clearJoinCode() {
  const url = new URL(location.href);
  url.searchParams.delete('join');
  history.replaceState(null, '', url.toString());
}

export function App({ api, initial }: { api: Api; initial: Snapshot | null }) {
  const [snap, setSnap] = useState(initial);
  const [joinCode, setJoinCode] = useState(readJoinCode);
  const [invite, setInvite] = useState<InviteInfo | null>(null);

  useEffect(() => {
    if (!joinCode) return;
    api.invite(joinCode).then((info) => {
      setInvite(info);
      if (!info) {
        clearJoinCode();
        setJoinCode(null);
      }
    });
  }, [api, joinCode]);

  const inviteHandled = () => {
    clearJoinCode();
    setJoinCode(null);
    setInvite(null);
  };

  if (!snap) return <Welcome api={api} invite={invite} onSignedUp={setSnap} />;
  return (
    <StoreProvider api={api} initial={snap}>
      <Main invite={invite} joinCode={joinCode} onInviteHandled={inviteHandled} />
    </StoreProvider>
  );
}

function Main({ invite, joinCode, onInviteHandled }: { invite: InviteInfo | null; joinCode: string | null; onInviteHandled: () => void }) {
  const { snap } = useStore();
  return (
    <>
      {snap.me.onboarded ? (
        <Shell invite={invite} joinCode={joinCode} onInviteHandled={onInviteHandled} />
      ) : (
        <Setup invite={invite} inviteCode={joinCode} onInviteHandled={onInviteHandled} />
      )}
      <Toasts />
      <Paywall />
      <Confirm />
    </>
  );
}

function tabFromHash(): Tab {
  const t = location.hash.replace('#', '') as Tab;
  return TABS.some((x) => x.id === t) ? t : 'today';
}

function Shell({ invite, joinCode, onInviteHandled }: { invite: InviteInfo | null; joinCode: string | null; onInviteHandled: () => void }) {
  const { snap, api } = useStore();
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [sos, setSos] = useState(false);

  useEffect(() => {
    const onHash = () => {
      setTab(tabFromHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const myAlert = snap.myAlerts.some((a) => !a.alert.resolvedAt);
  const circleAlert = snap.circleAlerts.some((a) => !a.alert.resolvedAt);

  return (
    <div className="shell">
      {api.mode === 'demo' && (
        <div className="demo-ribbon">
          <SunMark size={14} /> Demo: runs on this device, nothing is really texted or called
        </div>
      )}
      <main>
        {tab === 'today' && <Today onSos={() => setSos(true)} />}
        {tab === 'circle' && <Circle />}
        {tab === 'moments' && <Moments />}
        {tab === 'vault' && <Vault />}
        {tab === 'you' && <You />}
      </main>
      <nav className="tabbar" aria-label="Sections">
        {TABS.map(({ id, label, icon: Icon }) => {
          const dot = (id === 'today' && myAlert) || (id === 'circle' && circleAlert) || (id === 'moments' && !!snap.moment);
          return (
            <a key={id} href={`#${id}`} className={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined}>
              <span className="tab-icon">
                <Icon size={22} strokeWidth={tab === id ? 2.4 : 1.9} />
                {dot && <span className={`tab-dot${id === 'moments' ? ' calm' : ''}`} />}
              </span>
              <span className="tab-label">{label}</span>
            </a>
          );
        })}
      </nav>
      <SosSheet open={sos} onClose={() => setSos(false)} />
      {invite && joinCode && <JoinSheet invite={invite} code={joinCode} onDone={onInviteHandled} />}
    </div>
  );
}

function JoinSheet({ invite, code, onDone }: { invite: InviteInfo; code: string; onDone: () => void }) {
  const { run, snap } = useStore();
  const [watch, setWatch] = useState(true);
  const [mutual, setMutual] = useState(true);
  const name = firstName(invite.name);
  const own = snap.me.inviteCode === code.toLowerCase();

  async function join() {
    if (await run({ type: 'acceptInvite', code, watch, mutual })) onDone();
  }

  return (
    <Sheet open onClose={onDone} title={own ? 'That\'s your invite link' : `Join ${name}'s circle`}>
      {own ? (
        <p className="muted">Send it to someone else so they can join your circle.</p>
      ) : (
        <div className="form">
          <div className="invite-banner">
            <Avatar name={invite.name} color={invite.color} size={40} />
            <span>{name} invited you.</span>
          </div>
          <label className="row-toggle">
            <span>I'll watch over {name}</span>
            <Toggle checked={watch} onChange={setWatch} label={`Watch over ${name}`} />
          </label>
          <label className="row-toggle">
            <span>{name} watches over me</span>
            <Toggle checked={mutual} onChange={setMutual} label={`${name} watches over me`} />
          </label>
          <button className="btn primary block" onClick={join} disabled={!watch && !mutual}>
            Join circle
          </button>
        </div>
      )}
    </Sheet>
  );
}

function Confirm() {
  const { question, answer } = useStore();
  return (
    <Sheet open={!!question} onClose={() => answer(false)} title={question?.title}>
      {question?.body && <p className="muted">{question.body}</p>}
      <div className="row-btns">
        <button className="btn" onClick={() => answer(false)}>
          {question?.cancel ?? 'Never mind'}
        </button>
        <button className={`btn ${question?.danger ? 'danger' : 'primary'}`} onClick={() => answer(true)}>
          {question?.confirm}
        </button>
      </div>
    </Sheet>
  );
}

function Toasts() {
  const { toasts, dismiss } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast tone-${t.tone}`} role={t.tone === 'alert' || t.tone === 'error' ? 'alert' : 'status'}>
          <button
            className="toast-body"
            onClick={() => {
              if (t.link) location.hash = t.link;
              dismiss(t.id);
            }}
          >
            <strong>{t.title}</strong>
            {t.body && <span>{t.body}</span>}
          </button>
          <button className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
