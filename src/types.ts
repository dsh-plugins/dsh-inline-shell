/**
 * Structural types for the Host services this plugin uses. The plugin ships
 * without runtime or type dependencies on the Harness packages, so each face
 * is declared as the minimal shape the plugin actually reads. Harness type
 * names are quoted in comments so a reader can match them to the real
 * packages.
 */

/** `ShellExecRequest` subset accepted by `ctx.shell.resolve`. */
export interface ShellExecRequest {
  command: string
  workdir?: string
  timeoutMs?: number
  stdoutMaxBytes?: number
  signal?: AbortSignal
}

/** `ShellExecSpec` subset: the resolved request the executor accepts. */
export interface ShellExecSpec {
  readonly command: string
  readonly workdir: string
  readonly timeoutMs: number
}

/** Captured stream detail the plugin reads from a settled result. */
export interface CollectedOutput {
  readonly text: string
}

/** `ShellRunResult` subset returned by `execution.result()`. */
export interface ShellRunResult {
  readonly exitCode: number | null
  readonly signal: string | null
  readonly timedOut: boolean
  readonly aborted: boolean
  readonly stdout: CollectedOutput
  readonly stderr: CollectedOutput
}

/** `ShellExecution` subset: the foreground projection is all this plugin awaits. */
export interface ShellExecution {
  result(): Promise<ShellRunResult>
}

/** `ctx.shell` (`ShellExecutor`): resolve a request, then execute the spec. */
export interface ShellService {
  resolve(request: ShellExecRequest): ShellExecSpec
  execute(spec: ShellExecSpec): Promise<ShellExecution>
}

/** `ctx.workingDirectory` subset: the Session's effective directory. */
export interface WorkingDirectoryService {
  ensure(agent: AgentLike, signal: AbortSignal): Promise<string>
}

/** One content block of a message; only text blocks carry a `text` string. */
export interface ContentBlockLike {
  readonly type: string
  readonly text?: string
}

/** `MessageSource` subset: the producer tag of one user-role message. */
export interface MessageSource {
  readonly kind: string
  readonly form?: string
  readonly summary?: string
}

/** `UserMessage` shape the pre-step listener reads and rewrites. */
export interface UserMessageLike {
  readonly id: string
  readonly role: 'user'
  readonly content: readonly ContentBlockLike[]
  readonly source: MessageSource
}

/** `PreStepDecision` subset: only the enter branch carries messages. */
export type PreStepDecisionLike =
  | { readonly kind: 'reject' }
  | {
    readonly kind: 'enter'
    readonly messages: readonly UserMessageLike[]
    readonly startsRequestSeries?: true
  }

/** Payload of one `agent/pre-step` waterfall call. */
export interface PreStepPayload {
  readonly messages: readonly UserMessageLike[]
  readonly turn: number
  readonly step: number
  readonly signal: AbortSignal
}

/** One `agent/pre-step` waterfall listener. */
export type PreStepListener = (
  payload: PreStepPayload,
  next: () => Promise<PreStepDecisionLike>,
) => Promise<PreStepDecisionLike>

/** The agent-scoped context face the listener registers on. */
export interface AgentScope {
  effect(callback: () => () => void, label?: string): () => void
  on(event: 'agent/pre-step', listener: PreStepListener): () => void
}

/** One live agent as far as the plugin addresses it. */
export interface AgentLike {
  readonly id: string
  readonly ctx: AgentScope
}

/** Host context face: the services plus the lifecycle events used here. */
export interface HostContext {
  readonly shell: ShellService
  readonly workingDirectory: WorkingDirectoryService
  effect(callback: () => () => void, label?: string): () => void
  on(event: 'agent/created', listener: (payload: { readonly agent: AgentLike }) => void): () => void
  on(event: 'agent/disposed', listener: (payload: { readonly agent: AgentLike }) => void): () => void
}
