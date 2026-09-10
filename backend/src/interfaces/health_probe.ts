/**
 * The dependency check behind the readiness endpoint.
 *
 * Declared as a contract rather than taking a `PrismaClient` directly, so the route depends on the
 * one behaviour it needs and a test can supply a double without casting.
 */
export interface HealthProbe {
  /**
   * Confirms the datastore is reachable.
   *
   * @returns Resolves when the datastore answered.
   * @throws {Error} When the datastore is unreachable. The caller reports 503 and does not
   * forward the message, which could carry connection details.
   */
  check_connection(): Promise<void>;
}
