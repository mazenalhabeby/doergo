import fs from "fs"
import path from "path"

/**
 * Every source file of one server module folder, concatenated. The server's
 * services are split by job (2026-10-16): a guard that reads "the service" reads
 * the folder, so it keeps working whichever file a rule lives in.
 */
export function serverModuleSource(dir: string, except: string[] = []): string {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".spec.ts") && !except.includes(f))
    .sort()
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
    .join("\n")
}
