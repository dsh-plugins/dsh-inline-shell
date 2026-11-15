/**
 * Host-half wiring: the `!` prefix reaches the model plane as a recorded
 * conversation entry.
 *
 * The Web composer submits an ordinary message, so the only place the
 * conversation can turn one into a shell command is the agent's pre-step
 * waterfall: it owns the batch that becomes the model request and, at the same
 * time, the `user/message` events the Chat renders. This plugin runs the command
 * and records the entry itself, then enters the step with no messages — the
 * loop's documented "no model call" turn — so a shell command costs no model
 * turn and the agent reads the result at its next step.
 */

import { randomUUID } from 'node:crypto'
import { runInlineShell } from './execute.ts'
import { usageEntry, type ShellEntry } from './format.ts'
import { SHELL_PREFIX, SOURCE_FORM, SOURCE_KIND } from './shared.ts'
import type {
  AgentLike, HostContext, PreStepDecisionLike, PreStepListener, UserMessageLike,
} from './types.ts'

/** Settled entries per Session, keyed by the message identity that produced them. */
type EntryCache = Map<string, Promise<ShellEntry>>

/** Which delivery a `!` command takes. */
export interface InlineShellOptions {
  /**
   * `none` records the entry and closes the turn without a model request;
   * `model` keeps the turn so the agent reads the entry in that same step and can
   * comment on it. Chat folds a no-step turn's rows into a collapsed group, which
   * is why the visible-row mode is the one that spends a request.
   */
  readonly turn: 'none' | 'model'
}

/**
 * Register the pre-step listener for every agent created while the plugin is
 * loaded, and drop it again when that agent is disposed or the plugin unloads.
 * @param ctx - owning host context.
 * @param options - delivery mode for a command-only batch.
 */
export function installInlineShell(ctx: HostContext, options: InlineShellOptions): void {
  const listeners = new Map<AgentLike, () => void>()
  ctx.on('agent/created', ({ agent }) => {
    const cache: EntryCache = new Map()
    const dispose = agent.ctx.effect(
      () => agent.ctx.on('agent/pre-step', createListener(ctx, agent, cache, options)),
      'inline-shell: pre-step',
    )
    listeners.set(agent, dispose)
  })
  ctx.on('agent/disposed', ({ agent }) => {
    listeners.get(agent)?.()
    listeners.delete(agent)
  })
  ctx.effect(() => () => {
    for (const dispose of listeners.values()) dispose()
    listeners.clear()
  }, 'inline-shell: agent listeners')
}

/**
 * Build the pre-step listener of one agent.
 *
 * A batch made only of shell commands never reaches the model: the commands run,
 * their entries are recorded as ordinary `user/message` events, and the step is
 * rejected. Rejection is the one decision every other pre-step listener passes
 * through unchanged, and the loop closes the turn without a step and without a
 * request. A batch that also carries input meant for the model keeps the turn and
 * enters with the entries appended, so the model reads them in that same step.
 * @param ctx - owning host context.
 * @param agent - agent whose steps the listener sees.
 * @param cache - settled entries of this agent's Session.
 * @param options - delivery mode for a command-only batch.
 * @returns the waterfall listener.
 */
function createListener(
  ctx: HostContext,
  agent: AgentLike,
  cache: EntryCache,
  options: InlineShellOptions,
): PreStepListener {
  return async (payload, next): Promise<PreStepDecisionLike> => {
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    const commands: { message: UserMessageLike; command: string }[] = []
    let carriesModelInput = false
    for (const message of decision.messages) {
      const command = commandOf(message)
      if (command !== undefined) {
        commands.push({ message, command })
        continue
      }
      // Injected context (runtime context, skill catalogs) joins every batch and
      // does not make the step need a model call; only a human prompt does.
      if (message.source.kind === 'user') carriesModelInput = true
    }
    if (commands.length === 0) return decision

    const entries: UserMessageLike[] = []
    for (const { message, command } of commands) {
      entries.push(await entryMessage(ctx, agent, cache, message, command, payload.signal))
    }

    if (!carriesModelInput && payload.step === 1 && options.turn === 'none') {
      for (const entry of entries) {
        agent.session.append('user/message', entry, { surfaceOp: 'append' })
      }
      return { kind: 'reject' }
    }

    const messages: UserMessageLike[] = []
    let nextEntry = 0
    for (const message of decision.messages) {
      messages.push(message)
      if (commandOf(message) === undefined) continue
      const entry = entries[nextEntry]
      nextEntry += 1
      if (entry !== undefined) messages.push(entry)
    }
    return { ...decision, messages }
  }
}

/**
 * Read the command a message asks to run.
 * @param message - one message of the claimed pre-step batch.
 * @returns the command text, an empty string for a bare prefix, or undefined.
 */
function commandOf(message: UserMessageLike): string | undefined {
  if (message.source.kind !== 'user') return undefined
  const blocks = message.content
  if (blocks.length !== 1) return undefined
  const block = blocks[0]
  if (block === undefined || block.type !== 'text' || block.text === undefined) return undefined
  if (!block.text.startsWith(SHELL_PREFIX)) return undefined
  return block.text.slice(SHELL_PREFIX.length).trim()
}

/**
 * Build the context entry that records one command's run.
 *
 * The entry is a separate user-role message with a plugin-owned source kind, so
 * Chat renders it as an injected-context row (collapsed summary, expandable
 * body) next to the user's own `!` line instead of replacing it: the human
 * still reads what they typed, and the model receives the command and output in
 * the same step.
 * @param ctx - owning host context.
 * @param agent - agent whose Session directory the command runs in.
 * @param cache - settled entries of this agent's Session.
 * @param message - the `!`-prefixed message that carried the command.
 * @param command - command text after the prefix.
 * @param signal - turn cancellation signal.
 * @returns the context message to append after the user's message.
 */
async function entryMessage(
  ctx: HostContext,
  agent: AgentLike,
  cache: EntryCache,
  message: UserMessageLike,
  command: string,
  signal: AbortSignal,
): Promise<UserMessageLike> {
  const entry = command === ''
    ? usageEntry()
    : await settledEntry(ctx, agent, cache, message.id, command, signal)
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: entry.text }],
    source: { kind: SOURCE_KIND, form: SOURCE_FORM, summary: entry.summary },
  }
}

/**
 * Run one command at most once per message: a retried request re-admits the
 * same batch, and a command may have side effects.
 * @param ctx - owning host context.
 * @param agent - agent whose Session directory the command runs in.
 * @param cache - settled entries of this agent's Session.
 * @param messageId - identity of the message that carried the command.
 * @param command - command text after the prefix.
 * @param signal - turn cancellation signal.
 * @returns the settled entry.
 */
function settledEntry(
  ctx: HostContext,
  agent: AgentLike,
  cache: EntryCache,
  messageId: string,
  command: string,
  signal: AbortSignal,
): Promise<ShellEntry> {
  const cached = cache.get(messageId)
  if (cached !== undefined) return cached
  const pending = runInlineShell(ctx, agent, command, signal)
  cache.set(messageId, pending)
  return pending
}
