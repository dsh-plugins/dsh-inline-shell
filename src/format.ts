/**
 * Rendering of one inline shell result into the two faces this plugin keeps:
 * the model-facing `<user_shell_command>` fragment and the one-line account the
 * Chat context row shows while collapsed.
 *
 * The fragment shape follows the Codex CLI's user-shell-command context item,
 * so a model already trained on that convention reads the same fields here.
 */

import { OUTPUT_MAX_CHARS, TRUNCATION_NOTICE } from './shared.ts'
import type { ShellRunResult } from './types.ts'

/** One recorded conversation entry: its model-facing text and collapsed summary. */
export interface ShellEntry {
  readonly text: string
  readonly summary: string
}

/** Duration in the fixed four-decimal form the fragment reports. */
function seconds(durationMs: number): string {
  return (durationMs / 1000).toFixed(4)
}

/** Bound the rendered output so one large command cannot flood the conversation. */
function clip(text: string): string {
  return text.length <= OUTPUT_MAX_CHARS
    ? text
    : `${text.slice(0, OUTPUT_MAX_CHARS)}\n${TRUNCATION_NOTICE}`
}

/** Exit code to report: a result cut short by a timeout or abort reports -1. */
function exitCodeOf(result: ShellRunResult): number {
  return result.exitCode ?? -1
}

/** Command output as one body: stdout, stderr, then the reason a run was cut short. */
function combinedOutput(result: ShellRunResult): string {
  const parts: string[] = []
  const stdout = result.stdout.text
  const stderr = result.stderr.text
  if (stdout !== '') parts.push(stdout)
  if (stderr !== '') parts.push(`[stderr]\n${stderr}`)
  if (result.aborted) {
    parts.push('command aborted')
  } else if (result.timedOut) {
    parts.push('command timed out')
  } else if (result.exitCode === null && result.signal !== null) {
    parts.push(`killed by ${result.signal}`)
  }
  return parts.join('\n')
}

/** How one settled run is named on the collapsed row. */
function statusOf(result: ShellRunResult): string {
  if (result.aborted) return 'aborted'
  if (result.timedOut) return 'timed out'
  if (result.exitCode === null && result.signal !== null) return `killed by ${result.signal}`
  return `exit ${exitCodeOf(result)}`
}

/**
 * Render one settled run as the model-facing fragment.
 * @param command - exact command text the user submitted after the prefix.
 * @param result - settled shell result.
 * @param durationMs - measured wall-clock duration.
 * @returns the fragment text, output already bounded.
 */
export function fragment(command: string, result: ShellRunResult, durationMs: number): string {
  return [
    '<user_shell_command>',
    '<command>',
    command,
    '</command>',
    '<result>',
    `Exit code: ${exitCodeOf(result)}`,
    `Duration: ${seconds(durationMs)} seconds`,
    'Output:',
    clip(combinedOutput(result)),
    '</result>',
    '</user_shell_command>',
  ].join('\n')
}

/**
 * Build the conversation entry for one settled run.
 * @param command - exact command text the user submitted after the prefix.
 * @param result - settled shell result.
 * @param durationMs - measured wall-clock duration.
 * @returns model-facing text and the collapsed row summary.
 */
export function entryOf(command: string, result: ShellRunResult, durationMs: number): ShellEntry {
  return { text: fragment(command, result, durationMs), summary: `${command} → ${statusOf(result)}` }
}

/**
 * Build the entry for a run the executor could not start.
 * @param command - exact command text the user submitted after the prefix.
 * @param error - failure raised by resolving or spawning the command.
 * @returns model-facing text and the collapsed row summary.
 */
export function failureEntry(command: string, error: unknown): ShellEntry {
  const message = error instanceof Error ? error.message : String(error)
  return {
    text: [
      '<user_shell_command>',
      '<command>',
      command,
      '</command>',
      '<result>',
      'Exit code: -1',
      'Duration: 0.0000 seconds',
      'Output:',
      clip(`command failed to run: ${message}`),
      '</result>',
      '</user_shell_command>',
    ].join('\n'),
    summary: `${command} → failed`,
  }
}

/**
 * Build the entry for a bare prefix with no command to run.
 * @returns model-facing usage text and the collapsed row summary.
 */
export function usageEntry(): ShellEntry {
  return {
    text: 'No command was given. The ! prefix runs the rest of the message as a shell command in this conversation, '
      + 'for example: !echo hello',
    summary: 'no command given',
  }
}
