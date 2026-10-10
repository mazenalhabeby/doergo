/**
 * A coded refusal reaches the reader in THEIR language — through every way the
 * screens show one: `serverErrorMessage(e, t)`, `notify.error(e)` and, the
 * commonest by far, `notify.error(e.message)` (≈100 `onError` handlers).
 */
jest.mock("sonner", () => ({ toast: Object.assign(jest.fn(), { error: jest.fn() }) }))

import { toast } from "sonner"
import i18n, { changeLanguage } from "@/i18n"
import { apiError, serverErrorMessage } from "../server-error"
import { notify } from "../toast"
import de from "@/i18n/locales/de.json"
import en from "@/i18n/locales/en.json"

const refusal = () =>
  apiError({ status: 409, error: "Somebody else took the last place.", errorCode: "ROLE_TASK_TAKEN", errorParams: { takers: ["Mike"] } })

afterEach(async () => {
  await changeLanguage("en")
  ;(toast.error as jest.Mock).mockClear()
})

describe("a coded refusal, translated", () => {
  it("German: the message itself is German when it is read", async () => {
    await changeLanguage("de")
    expect(i18n.language).toBe("de")
    const e = refusal()
    expect(e.code).toBe("ROLE_TASK_TAKEN")
    expect(e.message).toBe((de as { serverErrors: Record<string, string> }).serverErrors.ROLE_TASK_TAKEN)
  })

  it("the language may change between the refusal and the toast", async () => {
    const e = refusal()
    expect(e.message).toBe((en as { serverErrors: Record<string, string> }).serverErrors.ROLE_TASK_TAKEN)
    await changeLanguage("de")
    expect(e.message).toBe((de as { serverErrors: Record<string, string> }).serverErrors.ROLE_TASK_TAKEN)
  })

  it("notify.error(e.message) and notify.error(e) both toast the translated sentence", async () => {
    await changeLanguage("de")
    const german = (de as { serverErrors: Record<string, string> }).serverErrors.ROLE_TASK_TAKEN
    const e = refusal()
    notify.error(e.message)
    notify.error(e)
    expect((toast.error as jest.Mock).mock.calls.map((c) => c[0])).toEqual([german, german])
  })

  it("serverErrorMessage fills a distance in the reader's units", async () => {
    await changeLanguage("de")
    const e = apiError({ status: 400, error: "Too far", errorCode: "OUTSIDE_GEOFENCE", errorParams: { location: "Lager", distanceMetres: 1500 } })
    const text = serverErrorMessage(e, i18n.t, "de")
    expect(text).toContain("Lager")
    expect(text).toMatch(/1,5\s?km/)
    expect(e.message).toBe(text)
  })

  it("an unknown code keeps the server's own sentence", () => {
    const e = apiError({ status: 400, error: "Something only the server knows", errorCode: "NOT_IN_THE_CATALOGUE" })
    expect(e.message).toBe("Something only the server knows")
    expect(serverErrorMessage(e, i18n.t)).toBe("Something only the server knows")
  })

  it("a refusal without a code is untouched", () => {
    const e = apiError({ status: 400, error: "Plain refusal" })
    expect(e.message).toBe("Plain refusal")
  })
})
