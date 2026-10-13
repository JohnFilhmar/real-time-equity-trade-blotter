import { HubConnectionBuilder, LogLevel, type HubConnection } from '@microsoft/signalr';
import type { ServerToClientEvents } from '@blotter/shared';
import { reconnect_delay } from './keepConnected';

/** Where the realtime service's hub listens, on this page's own origin. */
export const hub_path = '/hubs/blotter';

/** The blotter's live link to the realtime service. */
export type BlotterSocket = HubConnection;

/**
 * Creates the link to the realtime hub, not yet started, so the caller can attach listeners first.
 *
 * It connects to this page's own origin: the edge proxy forwards `/hubs/` to the realtime service
 * over the internal network, so the link needs no address of its own. The token is read through a
 * function on every connect and reconnect, so a reconnect after the access token rotates carries
 * the fresh token rather than the expired one. After a drop it retries forever on the Socket.IO
 * client's schedule. Logging is off, as Socket.IO's was: the connection pill is the user's view of
 * the link, and a retry loop would otherwise fill the console during an outage.
 *
 * @param get_token - Returns the current access token.
 * @returns A link that has not connected yet.
 */
export function create_socket(get_token: () => string): BlotterSocket {
  return new HubConnectionBuilder()
    .withUrl(hub_path, { accessTokenFactory: get_token })
    .withAutomaticReconnect({ nextRetryDelayInMilliseconds: (context) => reconnect_delay(context.previousRetryCount) })
    .configureLogging(LogLevel.None)
    .build();
}

/**
 * Listens for one broadcast, typed so an unknown event name, or a handler for the wrong payload,
 * will not compile.
 *
 * @param socket - The link.
 * @param event - A name from `trade_events`.
 * @param handler - Receives the payload the shared contract declares for that name.
 */
export function on_broadcast<E extends keyof ServerToClientEvents>(
  socket: BlotterSocket,
  event: E,
  handler: ServerToClientEvents[E],
): void {
  socket.on(event, handler);
}
