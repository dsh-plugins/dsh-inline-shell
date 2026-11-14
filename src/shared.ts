/**
 * Stable identities and the limits that shape one inline shell entry.
 */

/** Package identity; the loader entry id and the Cordis plugin name share it. */
export const PACKAGE_NAME = '@dsh-plugin/dsh-inline-shell'

/** Prefix that turns a conversation message into a shell command. */
export const SHELL_PREFIX = '!'

/** Durable `user/message` source kind of the entry this plugin records. */
export const SOURCE_KIND = 'inline-shell'

/** Context form of that source: a one-line account plus the model-facing text. */
export const SOURCE_FORM = 'notice'

/** Deadline for one inline command, in milliseconds. */
export const COMMAND_TIMEOUT_MS = 120_000

/** Foreground stdout capture budget asked of the executor, in bytes. */
export const STDOUT_MAX_BYTES = 256 * 1024

/** Character budget of the rendered command output inside the conversation entry. */
export const OUTPUT_MAX_CHARS = 12_000

/** Marker appended when the rendered output was cut to {@link OUTPUT_MAX_CHARS}. */
export const TRUNCATION_NOTICE = '[output truncated]'
