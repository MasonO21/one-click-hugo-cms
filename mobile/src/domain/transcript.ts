export interface RecognitionResult {
  transcript: string;
  isFinal: boolean;
}

function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// Chinese and Japanese are written without spaces and end sentences with "。".
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

function endsSentence(text: string): boolean {
  return /[.!?…。！？؟।]["'”’»」』)\]）]*$/u.test(text);
}

// A segment that stops mid-sentence ("so then,") should not get a full stop.
function endsMidSentence(text: string): boolean {
  return /[,;:\-–—、，；：]$/u.test(text);
}

function isCjkEdge(char: string | undefined): boolean {
  return Boolean(char && (CJK.test(char) || /[。！？、，；：「」『』（）]/u.test(char)));
}

// Capitalizes "the fog" but leaves "iPhone" alone.
function capitalize(text: string): string {
  return /^\p{Ll}(?!\p{Lu})/u.test(text) ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

// Joins recognized segments into readable text. Recognizers on some devices return
// lowercase text without punctuation, so each segment gets a capital and a full stop.
export function joinSegments(segments: string[]): string {
  const cleaned = segments.map(tidy).filter(Boolean);
  let joined = '';
  cleaned.forEach((segment, index) => {
    // A segment that continues a sentence ("so then," + "we left") keeps its lowercase.
    let text = joined === '' || !endsMidSentence(joined) ? capitalize(segment) : segment;
    const isLast = index === cleaned.length - 1;
    const cjk = isCjkEdge(text.at(-1));
    if (!isLast && !endsSentence(text) && !endsMidSentence(text)) text += cjk ? '。' : '.';
    const separator = joined === '' || (isCjkEdge(joined.at(-1)) && isCjkEdge(text.charAt(0))) ? '' : ' ';
    joined += separator + text;
  });
  return joined;
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
