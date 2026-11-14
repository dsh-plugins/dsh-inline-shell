/**
 * Inline shell for DeepSeek Harness.
 *
 * A conversation message that starts with `!` runs the rest of it as a shell
 * command in the Session's working directory; the command and its output
 * become a durable conversation entry that both the user and the model read.
 *
 * The plugin is Host-only: the Web composer has no submission hook for a `!`
 * line, so the agent's pre-step waterfall performs the interception.
 */

import { installInlineShell } from './intercept.ts'
import { PACKAGE_NAME } from './shared.ts'
import type { HostContext } from './types.ts'

/** Cordis plugin name; the loader entry id matches it. */
export const name = PACKAGE_NAME

/** Services this plugin cannot run without: command execution and the Session directory. */
export const inject = ['shell', 'workingDirectory']

/**
 * Mount the inline shell interception.
 * @param ctx - owning host context.
 */
export function apply(ctx: HostContext): void {
  installInlineShell(ctx)
}
