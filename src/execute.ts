/**
 * Execution of one inline shell command through the composed shell executor.
 *
 * The command runs in the Session's working directory. Confinement is bypassed
 * by default: the human typed the command, so it is the conversation's explicit
 * full-access escape hatch, exactly like the Codex CLI's `!`. `sandbox: 'session'`
 * makes it obey the composer's permission preset instead.
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
 * @param sandbox - `full` to bypass confinement, `session` to inherit the preset.
 * @returns the settled conversation entry.
 */
export async function runInlineShell(
  ctx: HostContext,
  agent: AgentLike,
  command: string,
  signal: AbortSignal,
  sandbox: 'full' | 'session',
): Promise<ShellEntry> {
  const startedAt = Date.now()
  try {
    const workdir = await workingDirectoryOf(ctx, agent, signal)
    const policy = sandboxPolicyOf(ctx, agent, sandbox)
    const spec = ctx.shell.resolve({
      command,
      ...(workdir === undefined ? {} : { workdir }),
      ...(policy === undefined ? {} : { sandboxPolicy: policy }),
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
 * Resolve the sandbox policy a `!` command runs under.
 *
 * The human typed the command, so it runs as the Codex CLI's `!` escape does:
 * with confinement bypassed and no approval. `sandbox: 'session'` keeps the
 * composer's permission preset instead, for deployments that want a typed
 * command to stay inside the conversation's own sandbox.
 * @param ctx - host context carrying the sandbox-policy service.
 * @param agent - agent owning the Session.
 * @param mode - `full` to bypass confinement, `session` to inherit the preset.
 * @returns the complete policy, or undefined when nothing confines execution.
 */
function sandboxPolicyOf(
  ctx: HostContext,
  agent: AgentLike,
  mode: 'full' | 'session',
): unknown {
  if (ctx.shell.sandboxMode === undefined) return undefined
  const policy = ctx.get('sandboxPolicy')
  if (policy === undefined) return undefined
  return mode === 'full'
    ? policy.resolve({ session: agent.session, mode: 'danger-full-access' })
    : policy.resolve({ session: agent.session })
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
