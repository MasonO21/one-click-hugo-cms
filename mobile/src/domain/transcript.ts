export interface RecognitionResult {
  transcript: string;
  isFinal: boolean;
}

function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function endsWithPunctuation(text: string): boolean {
  return /[.!?…]["')\]]*$/.test(text);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Joins recognized segments into readable text. Recognizers on some devices return
// lowercase text without punctuation, so each segment gets a capital and a full stop.
export function joinSegments(segments: string[]): string {
  const cleaned = segments.map(tidy).filter(Boolean);
  return cleaned
    .map((segment, index) => {
      const text = capitalize(segment);
      const isLast = index === cleaned.length - 1;
      return endsWithPunctuation(text) || isLast ? text : `${text}.`;
    })
    .join(' ');
}

// Collects speech results across segments and restarts. On Android each final result
// covers one segment; on iOS one final result covers the whole session. Either way,
// every final result is a separate piece of the entry.
export class TranscriptAccumulator {
  private committed: string[] = [];
  private interim = '';

  add(result: RecognitionResult): void {
    const text = tidy(result.transcript);
    if (result.isFinal) {
      if (text) this.committed.push(text);
      this.interim = '';
    } else {
      this.interim = text;
    }
  }

  // Keeps any partial text when a session ends without a final result.
  commitInterim(): void {
    if (this.interim) this.committed.push(this.interim);
    this.interim = '';
  }

  get liveText(): string {
    return joinSegments([...this.committed, this.interim]);
  }

  get isEmpty(): boolean {
    return this.committed.length === 0 && !this.interim;
  }

  reset(): void {
    this.committed = [];
    this.interim = '';
  }
}
