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

import { installInlineShell, type InlineShellOptions } from './intercept.ts'
import { PACKAGE_NAME } from './shared.ts'
import type { HostContext } from './types.ts'

/** Cordis plugin name; the loader entry id matches it. */
export const name = PACKAGE_NAME

/** Services this plugin cannot run without: command execution and the Session directory. */
export const inject = ['shell', 'workingDirectory']

/** Row configuration; every field is optional and defaults to the quiet mode. */
export interface InlineShellConfig {
  /**
   * `none` (default) runs the command without a model turn; `model` keeps the
   * turn so the agent reads the entry immediately and may comment on it.
   */
  readonly turn?: 'none' | 'model'
}

/**
 * Mount the inline shell interception.
 * @param ctx - owning host context.
 * @param config - the row's configuration.
 */
export function apply(ctx: HostContext, config?: InlineShellConfig): void {
  const options: InlineShellOptions = { turn: config?.turn === 'model' ? 'model' : 'none' }
  installInlineShell(ctx, options)
}
