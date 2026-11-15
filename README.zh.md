# 行内 Shell（!）

[English](README.md) | 中文

## 概要

在任意对话的输入框中发送以 `!` 开头的消息，该消息的剩余部分会作为 shell 命令执行，而不是交给模型。命令及其输出
会成为一条持久的对话记录：对话中新增一行 `inline-shell` 上下文条目（`You ran echo hello · exit 0`），展开后就是模型
实际收到的原文；这段原文会在同一步进入模型请求。

行为参照 OpenAI Codex CLI 的 `!` shell 转义：同样的 `<user_shell_command>` 片段格式，同样的"在对话所在处执行"
的规则，以及同样的判断——人键入的命令属于对话材料，而不是一次工具调用。

## 目录

- [使用](#use-this-package)
- [工作原理](#how-it-works)
- [实现说明](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用

安装本 bundle（在 Plugins > Add plugin 中选择该目录，或执行 `dsh plugin --profile <name> add <dir>`），
然后在任意对话中发送：

```text
!echo hello
```

输入框会像普通消息一样提交它。Host 在会话工作目录中运行 `echo hello`，并把这次运行记录为一条对话条目：

- 折叠行的措辞与 Codex CLI 的单元格一致：`You ran echo hello · exit 0`。
- 展开该行可看到面向模型的片段，包含退出码、耗时与输出。
- **默认不会启动模型轮次**：这条命令不产生任何请求、不消耗 token；agent 在它的下一步读到该条目，需要时才就结果作答。

只发送一个 `!` 不会执行任何命令，而是记录一条用法提示。

### 选择是否触发一轮对话

Chat 会把“没有 step 的轮次”折叠成一个分组，因此记录行藏在该分组的展开层里。把 `turn` 设为 `model` 可以保留这一轮：
agent 在同一步读到条目并就结果作答，行也会直接显示——代价是每条命令消耗一次模型请求。

```yaml
- id: inline-shell
  name: '@dsh-plugin/dsh-inline-shell'
  config:
    turn: model
```

### 命令的运行环境

命令通过当前 profile 的 shell 执行器（`ctx.shell`）在会话工作目录中运行，其沙箱策略与 agent 发起的命令相同。
若 profile 的默认预设是 `danger-full-access`（Desktop 应用即如此），命令不受限制地运行；沙箱化 profile 保留其
限制，而无法启动的沙箱后端会拒绝运行命令，而不是悄悄解除限制。

没有审批提示：命令是人键入的，命令本身就是这条消息。

-----

<a id="how-it-works"></a>
## 工作原理

1. Web 输入框把 `!echo hello` 作为普通提示提交；客户端没有针对 `!` 行的提交钩子（其命令面只裁定以 `/` 开头的行）。

2. 插件监听 agent 的 `agent/pre-step` 瀑布。只有单个文本块且以 `!` 开头的消息会被匹配，命令按消息身份只执行一次。

3. 当这批消息中没有别的内容需要模型处理时，插件自己把条目记录为一条 `user/message`，并拒绝该步。拒绝是所有其他
   pre-step 监听器都会原样透传的唯一决定，循环会关闭轮次、不建 step、也不发请求，因此命令不会到达模型服务。
   `turn: model` 则跳过拒绝，改为带条目进入该步。

4. 记录的条目带有 `source: { kind: 'inline-shell', form: 'notice', summary }`。Chat 会把任何非 `user` 的 source
   渲染为注入上下文行，因此看到一行摘要和可展开的正文；正文里的片段会在 agent 的下一步进入模型历史。

-----

<a id="understand-the-implementation"></a>
## 实现说明

| 文件 | 职责 |
|---|---|
| `src/index.ts` | 插件入口：导出 `name`、`inject`、`apply`。 |
| `src/intercept.ts` | 每个 agent 的 `agent/pre-step` 监听、`!` 解析、追加与按消息去重缓存。 |
| `src/execute.ts` | 通过 `ctx.shell` 在会话目录中执行一条命令。 |
| `src/format.ts` | 渲染 `<user_shell_command>` 片段与折叠行摘要。 |
| `src/shared.ts` | 包标识、前缀、source 形式与输出上限。 |
| `src/types.ts` | 插件读取的 Host 服务的最小结构化类型。 |

插件没有 Client 部分，也不对 Harness 包声明运行时依赖：它只读取 `ctx.shell` 与 `ctx.workingDirectory`，并自行
构造消息对象。

输出有界：执行器侧 stdout 上限 256 KiB，渲染输出上限 12,000 字符并附 `[output truncated]`，超过 120 秒的命令会被
终止并报告为 `Exit code: -1` 及 `command timed out`。

-----

<a id="model-experience"></a>
## 模型体验

### 模型看到什么

每条 `!` 命令都会新增一条 user 角色消息，格式与 Codex CLI 相同：

```text
<user_shell_command>
<command>
echo hello
</command>
<result>
Exit code: 0
Duration: 0.7100 seconds
Output:
hello
</result>
</user_shell_command>
```

stderr 会以 `[stderr]` 标签跟随在 stdout 之后。被提前中断的运行报告 `Exit code: -1` 并说明原因
（`command aborted`、`command timed out`、`killed by <signal>`）。执行器无法启动的命令报告
`command failed to run: <原因>`。

命令自身的消息不会被保留：记录的条目取代它，因此一次运行在对话里只有一行，而不是一条 `!` 行加一条结果。

### Token 影响

命令本身不产生任何请求。它的片段（输出最多约 12,000 字符）只在 agent 的下一个步骤进入一次模型历史；后续轮次从会话
日志重读，而不会重新执行命令。

### KV Cache 影响

该条目在模型的下一个步骤才加入请求前缀，而不是在命令运行期间。重试时命令不会重复执行：同一消息身份复用已结算的
条目。

## 已知限制

- **无法在输入框内拦截前缀。** 客户端提交状态机只裁定 `/` 行，触发器管线也只接受 `/` 与 `@`，因此 `!` 在人发送
  之后才被处理；这次运行会产生一对 `turn/start`/`turn/end`，但没有 step、也不会请求模型服务。
- **安静模式把结果行藏了一层。** 没有 step 的轮次会被折叠成分组，记录行就在它下面；`turn: model` 可以让行直接显示，
  代价是每条命令一次模型请求。
- **没有即时评论。** 默认模式下 agent 在它的下一步之前不会对结果发表意见；想让它解释就在下一次输入里问。
- **会话标题是独立调用。** profile 的会话标题生成器可能仍会为会话的第一条提示发起一次小请求；那不是 agent 轮次，
  可以在 profile 里关闭。
- **一条消息一条命令。** 仅当消息是单个文本块且以 `!` 开头时才视为命令；带附件的消息原样送达。
- **沿用会话沙箱，而不是 Codex 的完全访问逃生口。** Codex 会在禁用沙箱的情况下运行 `!` 命令；本插件沿用 profile
  的策略，因为一个悄悄扩大自身权限的插件会歪曲对话的沙箱事实。
- **没有流式输出。** 命令结算后才出现该行；长时间运行的命令在完成前不显示任何内容。
