/** Downscales a picked image to a small JPEG data URL for a check-in postcard. */
export async function photoToDataUrl(file: File, maxSide = 720, quality = 0.72): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('That file isn\'t an image we can read.'));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    let out = canvas.toDataURL('image/jpeg', quality);
    if (out.length > 380_000) out = canvas.toDataURL('image/jpeg', 0.5);
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

let audio: AudioContext | null = null;

function ctx(): AudioContext | null {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    return audio;
  } catch {
    return null;
  }
}

function tone(c: AudioContext, freq: number, start: number, length: number, volume = 0.18) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.02);
  gain.gain.setValueAtTime(volume, start + length - 0.05);
  gain.gain.linearRampToValueAtTime(0, start + length);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + length);
}

/** A short, insistent two-tone alarm. */
export function playAlarm() {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime;
  for (let i = 0; i < 4; i++) {
    tone(c, 880, t + i * 0.5, 0.22);
    tone(c, 660, t + i * 0.5 + 0.25, 0.22);
  }
  navigator.vibrate?.([300, 150, 300, 150, 300]);
}

export function playChime() {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime;
  tone(c, 784, t, 0.18, 0.1);
  tone(c, 1046, t + 0.14, 0.3, 0.1);
}

/** A phone ringtone; returns a function that stops it. */
export function startRingtone(): () => void {
  const c = ctx();
  navigator.vibrate?.([800, 400, 800, 400, 800]);
  if (!c) return () => undefined;
  let stopped = false;
  const ring = () => {
    if (stopped) return;
    const t = c.currentTime;
    for (let i = 0; i < 2; i++) {
      tone(c, 440, t + i * 0.45, 0.4, 0.12);
      tone(c, 480, t + i * 0.45, 0.4, 0.12);
    }
  };
  ring();
  const timer = setInterval(ring, 2600);
  return () => {
    stopped = true;
    clearInterval(timer);
    navigator.vibrate?.(0);
  };
}
