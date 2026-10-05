import { joinSegments, TranscriptAccumulator } from '@/domain/transcript';

describe('joinSegments', () => {
  it('capitalizes and punctuates segments', () => {
    expect(joinSegments(['the fog is lifting', 'legs feel heavy'])).toBe('The fog is lifting. Legs feel heavy');
  });

  it('keeps existing punctuation and tidies spaces', () => {
    expect(joinSegments(['  Wow!  ', 'great   view'])).toBe('Wow! Great view');
  });

  it('does not add a full stop after a pause mid-sentence', () => {
    expect(joinSegments(['so then,', 'we left'])).toBe('So then, we left');
    expect(joinSegments(['the trail goes up:', 'steep'])).toBe('The trail goes up: steep');
    expect(joinSegments(['she said “wow!”', 'ok'])).toBe('She said “wow!” Ok');
  });

  it('writes Chinese and Japanese without spaces or Latin full stops', () => {
    expect(joinSegments(['今日は晴れです。', '山頂に着いた。'])).toBe('今日は晴れです。山頂に着いた。');
    expect(joinSegments(['今日は晴れです', '山頂に着いた'])).toBe('今日は晴れです。山頂に着いた');
  });

  it('leaves words like iPhone alone', () => {
    expect(joinSegments(['iPhone battery is low'])).toBe('iPhone battery is low');
  });

  it('skips empty segments', () => {
    expect(joinSegments(['', '  ', 'hello'])).toBe('Hello');
    expect(joinSegments([])).toBe('');
  });
});

describe('TranscriptAccumulator', () => {
  it('shows interim text and replaces it as it improves', () => {
    const acc = new TranscriptAccumulator();
    acc.add({ transcript: 'the fog', isFinal: false });
    expect(acc.liveText).toBe('The fog');
    acc.add({ transcript: 'the fog is lifting', isFinal: false });
    expect(acc.liveText).toBe('The fog is lifting');
  });

  it('keeps every final segment (Android style)', () => {
    const acc = new TranscriptAccumulator();
    acc.add({ transcript: 'first part', isFinal: true });
    acc.add({ transcript: 'second', isFinal: false });
    acc.add({ transcript: 'second part', isFinal: true });
    expect(acc.liveText).toBe('First part. Second part');
  });

  it('keeps partial text when a session ends without a final result', () => {
    const acc = new TranscriptAccumulator();
    acc.add({ transcript: 'unfinished thought', isFinal: false });
    acc.commitInterim();
    acc.add({ transcript: 'new session', isFinal: true });
    expect(acc.liveText).toBe('Unfinished thought. New session');
  });

  it('ignores empty final results and resets', () => {
    const acc = new TranscriptAccumulator();
    acc.add({ transcript: '   ', isFinal: true });
    expect(acc.isEmpty).toBe(true);
    acc.add({ transcript: 'hello', isFinal: true });
    expect(acc.isEmpty).toBe(false);
    acc.reset();
    expect(acc.liveText).toBe('');
  });
});
