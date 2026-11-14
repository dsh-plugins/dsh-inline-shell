/**
 * Execution of one inline shell command through the composed shell executor.
 *
 * The command runs in the Session's working directory under the profile's
 * executor and sandbox policy, exactly as an agent-issued command would, so a
 * user-typed command never gains authority the conversation does not already
 * have.
 */

import { entryOf, failureEntry, type ShellEntry } from './format.ts'
import { COMMAND_TIMEOUT_MS, STDOUT_MAX_BYTES } from './shared.ts'
import type { AgentLike, HostContext } from './types.ts'

/**
 * Run one command and render its conversation entry. Execution failures are
 * reported as an entry rather than thrown: the conversation keeps a record of
 * what the user asked for.
 * @param ctx - host context carrying the shell and working-directory services.
 * @param agent - agent owning the Session whose directory the command runs in.
 * @param command - exact command text after the prefix.
 * @param signal - turn cancellation signal; firing it kills the command.
 * @returns the settled conversation entry.
 */
export async function runInlineShell(
  ctx: HostContext,
  agent: AgentLike,
  command: string,
  signal: AbortSignal,
): Promise<ShellEntry> {
  const startedAt = Date.now()
  try {
    const workdir = await workingDirectoryOf(ctx, agent, signal)
    const spec = ctx.shell.resolve({
      command,
      ...(workdir === undefined ? {} : { workdir }),
      timeoutMs: COMMAND_TIMEOUT_MS,
      stdoutMaxBytes: STDOUT_MAX_BYTES,
      signal,
    })
    const execution = await ctx.shell.execute(spec)
    const result = await execution.result()
    return entryOf(command, result, Date.now() - startedAt)
  } catch (error) {
    return failureEntry(command, error)
  }
}

/**
 * Resolve the Session directory. A directory that cannot be established is
 * advisory here: the executor's own configured default still runs the command.
 * @param ctx - host context carrying the working-directory service.
 * @param agent - agent owning the Session.
 * @param signal - turn cancellation signal.
 * @returns the absolute directory, or undefined to use the executor default.
 */
async function workingDirectoryOf(
  ctx: HostContext,
  agent: AgentLike,
  signal: AbortSignal,
): Promise<string | undefined> {
  try {
    const directory = await ctx.workingDirectory.ensure(agent, signal)
    return directory === '' ? undefined : directory
  } catch {
    return undefined
  }
}
