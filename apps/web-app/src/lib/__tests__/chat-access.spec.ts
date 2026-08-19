import { canOpenConversationWith } from "../chat-access"

/**
 * This rule has been got wrong three times in three different screens, each
 * time producing a button that did nothing when pressed. These cases are the
 * ones that were shipped.
 */
describe("canOpenConversationWith", () => {
  const me = "user-me"

  it("allows a conversation with a colleague", () => {
    expect(canOpenConversationWith("user-other", me)).toBe(true)
  })

  it("refuses a conversation with yourself", () => {
    // The member opening their own task: the Message button aimed at them.
    expect(canOpenConversationWith(me, me)).toBe(false)
  })

  it("refuses when there is nobody to reach", () => {
    expect(canOpenConversationWith(undefined, me)).toBe(false)
    expect(canOpenConversationWith(null, me)).toBe(false)
    expect(canOpenConversationWith("", me)).toBe(false)
  })

  it("still refuses an absent target when nobody is signed in", () => {
    // Both sides undefined must not read as "these are the same person".
    expect(canOpenConversationWith(undefined, undefined)).toBe(false)
  })

  it("allows a real target when the viewer is unknown", () => {
    // A signed-out or still-loading viewer shouldn't disable every button;
    // the server is the authority on whether the conversation is permitted.
    expect(canOpenConversationWith("user-other", undefined)).toBe(true)
  })
})
