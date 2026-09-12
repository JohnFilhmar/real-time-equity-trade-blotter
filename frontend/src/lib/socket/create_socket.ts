import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@blotter/shared';
import { api_url } from '@/config/env';

/** The blotter's socket, typed so an unknown event name will not compile. */
export type BlotterSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Creates a socket that authenticates with the access token and reconnects on its own.
 *
 * The token travels in the handshake `auth` payload, which is where the server looks first. It is
 * created disconnected so the caller can attach listeners before the first `connect` fires, and
 * `auth` is a plain object on purpose: the caller replaces it when the access token rotates, so a
 * reconnect after that carries the fresh token rather than the expired one.
 *
 * @param token - The current access token.
 * @returns A socket that has not connected yet.
 */
export function create_socket(token: string): BlotterSocket {
  return io(api_url, {
    auth: { token },
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    withCredentials: true,
  });
}
