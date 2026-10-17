import { Injectable } from '@nestjs/common';
import { ChatService } from './chat.service';

const TTL_MS = 60_000;
const MAX_PEOPLE = 2_000;

/**
 * "May I message this person?" — for the people lists (Team, Managers, a
 * profile), answered by chat's OWN rule (task-service ChatReachService), never
 * a second copy of it. One question per person per minute; the answer only
 * decides whether a Message button shows — every send is still checked again.
 */
@Injectable()
export class ChatReachLookup {
  private readonly cache = new Map<string, { ids: Set<string>; at: number }>();

  constructor(private readonly chat: ChatService) {}

  async reachableIds(userId: string, organizationId: string | null): Promise<Set<string>> {
    if (!organizationId) return new Set();
    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.ids;
    const res: any = await this.chat.reachableIds({ userId, organizationId }).catch(() => null);
    const list: unknown = res?.data ?? res;
    const ids = new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
    if (this.cache.size >= MAX_PEOPLE) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(userId, { ids, at: Date.now() });
    return ids;
  }

  /** The same rows, each saying whether the caller may message them. Accepts `rows` or `{ data: rows }`. */
  async annotate<T>(result: T, user: { id: string; organizationId: string | null }): Promise<T> {
    const rows: any[] | null = Array.isArray(result)
      ? result
      : Array.isArray((result as any)?.data)
        ? (result as any).data
        : null;
    if (!rows || rows.length === 0) return result;
    const ids = await this.reachableIds(user.id, user.organizationId);
    const marked = rows.map((r) => ({ ...r, canMessage: r?.id !== user.id && ids.has(r?.id) }));
    return (Array.isArray(result) ? marked : { ...(result as any), data: marked }) as T;
  }
}
