import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { create_socket_server, type BlotterSocketServer } from '../../realtime/socket_server.js';
import { create_mark_store } from '../marks/mark_store.js';
import { create_http_server } from './create_http_server.js';

let base_url: string;
let io: BlotterSocketServer;

// Composed in the production order: the server first, the socket server attached to it, and the app
// installed last. The app here answers every request with its own 404, so a response that came from
// the app is recognisable, and a socket request the app also answered would crash the process.
beforeAll(async () => {
  const { server, serve } = create_http_server();
  io = create_socket_server(server, create_mark_store());
  serve((_req, res) => {
    res.statusCode = 404;
    res.end('app');
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('the test server has no TCP address');
  }
  base_url = `http://127.0.0.1:${address.port.toString()}`;
});

afterAll(async () => {
  await io.close();
});

describe('create_http_server', () => {
  it('lets the socket engine answer a long-polling handshake on its own', async () => {
    const response = await fetch(`${base_url}/socket.io/?EIO=4&transport=polling`);
    expect(response.status).toBe(200);
    expect((await response.text()).startsWith('0{')).toBe(true);
  });

  it('hands every other request to the app', async () => {
    const response = await fetch(`${base_url}/api/v1/anything`);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('app');
  });

  it('keeps serving after polling handshakes instead of answering them twice', async () => {
    await fetch(`${base_url}/socket.io/?EIO=4&transport=polling`);
    await fetch(`${base_url}/socket.io/?EIO=4&transport=polling`);
    const response = await fetch(`${base_url}/after`);
    expect(await response.text()).toBe('app');
  });
});
