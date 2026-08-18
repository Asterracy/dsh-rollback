# opencode 桌面端「消息回滚」功能调研

> 调研对象：本地安装的 **OpenCode Desktop**（`@opencode-ai/desktop` v1.18.18，`/Users/asterracy/Desktop/OpenCode.app`）。
> 它本质上是**包装 opencode Web/CLI 的 Electron 壳**：`out/main/index.js`（主进程）只做窗口与菜单，
> 真正的会话逻辑在 `out/renderer/assets/main-DbEYQfC2.js`（≈5.9MB 的 Svelte 应用 bundle，
> 内含 `@opencode-ai/sdk` 与前端 store）。以下结论全部**从该 bundle 的逐字代码摘录**。

---

## 1. 一句话结论

opencode 的「消息回滚」不是单一入口，而是一族能力，都建立在**带分支/回溯的消息树**之上：

- **`session.undo` / `session.redo`** 命令：撤销最后一条（助手回合）消息、重做之；
- **`deleteMessage`** API：永久删除某条消息**及其所有 parts**（不还原文件改动）；
- **`session.fork`** API：从某条消息处**派生新会话**（"Fork from message"）；
- **`session.revert`** API：按消息撤文件改动。

> 其中 `session.fork`（从某条消息继续）与本插件在 DSH 里用的原语**完全同构**——DSH 的
> `session.fork({ atSeq })` 就是官方 branch 按钮的实现，二者都是"把会话带回某条消息再继续"。

---

## 2. 命令层（`command.session.*`，bundle @1825111 逐字）

```
command.session.undo   "Undo"                      desc "Undo the last message"
command.session.redo   "Redo"                      desc "Redo the last undone message"
command.session.compact"Compact session"           desc "Summarize the session to reduce context size"
command.session.fork   "Fork from message"         desc "Create a new session from a …(message)"
```

- **`undo` 的操作对象是"最后一条消息"**（通常是最近的助手回合），`redo` 把它再加回来。
- 这是 TUI/CLI 层面暴露给用户的回滚手势（撤销/重做最后一条消息）。

## 3. HTTP API 层（`@opencode-ai/sdk`，bundle 内逐字）

| 方法 | 请求 | 说明（SDK 文档注释） |
|---|---|---|
| `session.message.delete`（`deleteMessage`） | `DELETE /session/{sessionID}/message?messageID=…&directory=&workspace=` | **"Permanently delete a specific message and all of its parts from a session without reverting file changes."**（永久删除指定消息及其所有 parts，不改文件） |
| `session.fork` | `POST /api/session/{sessionID}/fork`，body `{ messageID }` | fork from message（派生自某条消息） |
| `session.revert.stage` | `POST /api/session/{sessionID}/revert/stage`，body `{ messageID, files }` | 按消息撤文件 |
| `session.delete` | `DELETE /session/{sessionID}` | 删整个会话 |

```js
// deleteMessage（bundle @2009315）
deleteMessage(parameters, options) {
  const params = buildClientParams([parameters], [{ args: [
    { in: "path", key: "sessionID" },
    { in: "path", key: "messageID" },
    { in: "query", key: "directory" },
    { in: "query", key: "workspace" },
  ]}]);
  return (options?.client ?? this.client).delete({ url: "/session/{sessionID}/message", ...params });
}
```

## 4. 消息数据模型（parts / 分支回溯关键）

- 每条消息有稳定 `id`（MessageID）；助手回答与工具调用作为**子部分（parts）**挂在消息下，
  并以 `"{messageID}:assistant"`、`"{messageID}:tool"`、`sessionMessagePartID(id,type,ordinal)` 等键组织（bundle @2277754）。
- 派生/渲染层会用 `parts.set(\`${messageID}:assistant\`, …)`、`parts.set(\`${messageID}:tool\`, …)` 组装消息，
  因此"删除一条消息 = 连同它的全部 parts 一起移除"（`deleteMessageParts` 在 store 里逐个清理
  `part_text_accum_delta` 等派生缓存，@2332790）。
- 会话维护一棵**消息树**（父/子消息、undo/redo 栈），所以 `undo` 能干净地回退、`redo` 能整体恢复，
  而不会破坏后续派生。

## 5. 与 DSH 的映射（本项目插件用到的对应物）

| opencode | DSH（本项目插件） |
|---|---|
| `session.fork(messageID)`（从消息派生） | `ctx.sessions.fork({ sessionId, atSeq })` + `open(childId)` — **回滚到此** |
| `command.session.undo`（撤销最后一条） | 本插件的「↶ 回滚到此」per-turn 按钮（回到该轮并继续） |
| 重新生成（regenerate 派生新回答） | 本插件的「↻ 重新生成本轮」——fork 到提问处并重发同一条 prompt |
| 消息树 + parts（可回溯历史） | DSH 仅追加 JSONL 事件日志 + fork 分支（原会话永远保留） |

> 关键差异：opencode 可**原地删除**历史消息（`deleteMessage` / `undo` 会真正改写消息数组）；
> DSH 的会话是**仅追加**的，没有可用的服务端破坏性 RPC（已用整库 grep 验证：无 rewind/delete-by-seq）。
> 因此在 DSH 里，「回滚」最忠实的实现是**分支式**：`session.fork` 裁出一个干净的新分支，原历史保留
> ——这与 opencode 的 `session.fork(messageID)`（fork from message）在语义上完全一致。

## 6. 附带验证

- 桌面壳的 `edit.undo`/`edit.redo`（`win.webContents.undo/redo`，@74906）是 **Electron 文本框**撤销，
  与消息回滚无关；bundle 里的 `rollback` 命中多为终端 `scrollback`（回滚缓冲区）误报。真正的回滚即 §2/§3 的 session 能力。

---

*本报告由对打包产物 `out/renderer/assets/main-DbEYQfC2.js` 的逐字代码挖掘得到；未联网、未上传统计。*
