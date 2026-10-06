import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { initials } from '../lib/format';
import { useStore } from '../store/StoreContext';

export function Avatar({ name, color, size = 40, ring }: { name: string; color: string; size?: number; ring?: 'ok' | 'warn' | 'danger' }) {
  return (
    <span
      className={`avatar${ring ? ` ring-${ring}` : ''}`}
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function Sheet({ open, onClose, title, children, tall }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; tall?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet${tall ? ' tall' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        {title && (
          <div className="sheet-head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`toggle${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

export function Photo({ src, alt }: { src: string; alt: string }) {
  const { api } = useStore();
  const [url, setUrl] = useState<string | null>(src.startsWith('data:') ? src : null);
  useEffect(() => {
    let live = true;
    api.photo(src).then((u) => live && setUrl(u)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, src]);
  return url ? <img className="photo" src={url} alt={alt} loading="lazy" /> : <div className="photo placeholder" />;
}

export function PremiumBadge() {
  return <span className="badge premium">Premium</span>;
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <p className="empty-title">{title}</p>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

export function SunMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="sunmark" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#F2705E" />
          <stop offset="1" stopColor="#FFC54D" />
        </linearGradient>
      </defs>
      <path d="M12 44a20 20 0 0 1 40 0z" fill="url(#sunmark)" />
      <g stroke="#F2A03A" strokeWidth="4" strokeLinecap="round">
        <path d="M32 10v7M14.5 17.5l5 5M49.5 17.5l-5 5M6 33h7M51 33h7" />
      </g>
      <path d="M6 50h52" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
