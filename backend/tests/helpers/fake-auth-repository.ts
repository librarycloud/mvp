import type {
  AuthRepository,
  NewRefreshSession,
} from "../../src/modules/auth/auth.repository.js";
import type {
  AuthUserRecord,
  RefreshSessionRecord,
  RequestContext,
} from "../../src/modules/auth/auth.types.js";

export class FakeAuthRepository implements AuthRepository {
  users: AuthUserRecord[] = [];
  sessions = new Map<number, RefreshSessionRecord>();
  private sessionSequence = 1;
  loginEvents: Array<{ userId: number | null; succeeded: boolean }> = [];

  async findUserByUsername(username: string) {
    return this.users.find((user) => user.username === username) ?? null;
  }

  async findUserById(id: number) {
    return this.users.find((user) => user.id === id) ?? null;
  }

  async findRefreshSession(tokenHash: string) {
    return [...this.sessions.values()].find((session) => session.tokenHash === tokenHash) ?? null;
  }

  async createRefreshSession(session: NewRefreshSession) {
    const user = this.users.find((item) => item.id === session.userId);
    if (!user) throw new Error("Unknown user");
    const id = this.sessionSequence++;
    this.sessions.set(id, { id, ...session, revokedAt: null, user });
  }

  async rotateRefreshSession(currentId: number, next: NewRefreshSession) {
    const current = this.sessions.get(currentId);
    if (!current) throw new Error("Unknown session");
    current.revokedAt = new Date();
    await this.createRefreshSession(next);
  }

  async revokeRefreshSession(tokenHash: string) {
    const session = await this.findRefreshSession(tokenHash);
    if (session) session.revokedAt = new Date();
  }

  async getIdleTimeoutMinutes() {
    return 30;
  }

  async recordLogin(userId: number | null, succeeded: boolean, _context: RequestContext) {
    this.loginEvents.push({ userId, succeeded });
  }
}
