import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/** A tiny JPEG-looking payload: real signature bytes, padded to satisfy the minimum length. */
export function fakeJpegBase64(extraBytes = 200): string {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(extraBytes, 1)]).toString('base64');
}

export interface Captured {
  method?: string;
  url?: string;
  headers: IncomingMessage['headers'];
  body: any;
}

/** Stands in for api.anthropic.com so the real SDK code path (serialisation, headers, parsing) runs. */
export async function fakeAnthropic(
  respond: (captured: Captured) => { status?: number; json: unknown },
): Promise<{ baseURL: string; requests: Captured[]; close: () => Promise<void> }> {
  const requests: Captured[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const captured: Captured = { method: req.method, url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null };
      requests.push(captured);
      const { status = 200, json } = respond(captured);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    baseURL: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

export function messageResponse(text: string, stopReason = 'end_turn') {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: text === '' ? [] : [{ type: 'text', text }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}
