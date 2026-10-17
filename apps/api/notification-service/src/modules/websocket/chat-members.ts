/**
 * Who is in a conversation, for the typing relay.
 *
 * "…is typing" used to go to whoever the CLIENT named, filtered only by
 * organization — so a member could make it appear on any colleague's screen.
 * It now goes to the conversation's members, read from the database. Typing
 * fires every couple of seconds while someone writes, so the answer is kept for
 * a minute per conversation (a member list changes far less often than that).
 */
export type MembersLoader = (conversationId: string) => Promise<string[]>;

export class ChatMembersCache {
  private readonly rows = new Map<string, { ids: string[]; at: number }>();

  constructor(
    private readonly load: MembersLoader,
    private readonly ttlMs = 60_000,
    private readonly maxEntries = 5_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** The members changed (a group, a job's crew): the next question reads them again. */
  forget(conversationId: string): void {
    this.rows.delete(conversationId);
  }

  async members(conversationId: string): Promise<string[]> {
    const hit = this.rows.get(conversationId);
    if (hit && this.now() - hit.at < this.ttlMs) return hit.ids;
    const ids = await this.load(conversationId);
    if (this.rows.size >= this.maxEntries) {
      const oldest = this.rows.keys().next().value;
      if (oldest !== undefined) this.rows.delete(oldest);
    }
    this.rows.set(conversationId, { ids, at: this.now() });
    return ids;
  }
}

/**
 * Who should see "…is typing": the conversation's other members, only when the
 * sender is one of them, and only those in the sender's own organization (typing
 * never crosses a company boundary — see the relay's note).
 */
export function typingRecipients(
  members: readonly string[],
  senderId: string,
  orgOf: (userId: string) => string | undefined,
  senderOrg: string,
): string[] {
  if (!members.includes(senderId)) return [];
  return members.filter((id) => id !== senderId && orgOf(id) === senderOrg);
}
