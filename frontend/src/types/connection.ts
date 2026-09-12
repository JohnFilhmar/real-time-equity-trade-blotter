/**
 * The four states of the live link.
 *
 * `connecting` is the first handshake. `live` means the socket is open and the data has been
 * reconciled. `reconnecting` means the socket is down and retrying. `resyncing` means the socket is
 * open but a refetch is in flight, so the rows on screen are not yet trustworthy. Green never
 * appears the instant the socket opens.
 */
export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'resyncing';
