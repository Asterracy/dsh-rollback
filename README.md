# dsh-rollback · DSH 消息回滚插件

> 模仿 **opencode 桌面端**的「消息回滚 / 重新生成」体验，做成 **DeepSeek Harness（DSH）** 专属插件。
> 一份插件，同时作用于 **DSH 桌面端** 与 **DSH Web 端**——两端的聊天 UI 共用同一套客户端插件系统（`dsh.client.platform: "web"`）。

## 它做什么

在每一条**已完成的助手轮次（turn）尾**，各加两个 opencode 式操作：

| 操作 | 行为 |
|------|------|
| **↶ 回滚到此** | 把会话**裁到这条消息**、从它结束的地方开一条**新分支继续**（原会话保留为分支）。对应 opencode 的 "go back to a message and continue"。 |
| **↻ 重新生成本轮**（仅最近一轮） | 找到本轮提问，**放弃本轮回答**，回到提问处**重新生成**（原历史保留为分支）。对应 opencode 的 "regenerate"。 |

因为 DSH 的会话是**仅追加事件日志**（没有服务端 "rewind" RPC），回滚采用 DSH 自带的**分支式**方式：
`session.fork({ sessionId, atSeq })` 在指定消息边界裁出新会话，再 `session.open(childId)` 切过去。
原会话与历史**原样保留**为分支——这与 opencode 用 git 保留历史、同时允许回滚到某条消息的做法在精神上一致。

## 快速安装

### 桌面端 / Web 端（路径完全一样）

```sh
# 方式 A：官方插件市场一键装（若插件已上架 awesome-dsh-plugin）
dsh plugin --profile web add dsh-rollback

# 方式 B：本地包（file: 依赖）+ 手动 patch（开发期最省事）
#   1) 在 ~/.dsh/profiles/web/ 里把本包加进依赖并 pnpm install
#   2) 在 ~/.dsh/profiles/web/cordis.patch.yml 里插入：
#        - insert:
#            - id: dsh-rollback
#              name: 'dsh-rollback'
#   3) 重启 DSH（web 端口 / 桌面端重启）
```

装好后刷新 / 重启，聊天视图里每条已完成的助手消息尾就会多出「回滚到此 / 重新生成本轮」按钮。

> 也可以放到 DSH 插件市场（[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)）上架，供所有人 `dsh plugin … add` 安装。

## 构建与开发

`client/client.js` 是**免构建即可加载**的成品（DSH 的 `window.__ModuleLoader__.load({ id, factory })` 模块格式）。
`src/client/` 是等价的 TypeScript 源码，供维护与 `typecheck`：

```sh
pnpm install
pnpm typecheck     # tsc 校验 src/client
pnpm build         # 用 tsdown 从 src/client 重新生成 client/client.js（含 banner 包装）
```

`package.json` 里 `dsh.client.inject` 声明了本插件依赖的客户端包，`dsh.bundle.patch` 指向 `cordis.patch.yml`
（被装进 profile 时插入 loader 层）。

## 实现要点（映射到 DSH 契约）

- **入口**：`exports { apply(ctx), inject, name }`，`apply` 就是 Cordis 插件主体。
- **按钮挂点**：`ctx.slots.inject("conversation.chat.turnTail", …)`（chain slot，`scope:"session"`）。
  每条已完成轮次把 `TurnTailOwnerProps { turn, seq, openFile }` 交给渲染器；会话作用域还会把当前
  `sessionId` 传给注册的 `inject` 回调。`assistant-actions`（list slot，按 `messageId`）是另一种
  可选挂点。
- **回滚原语**：`ctx.sessions.fork({ sessionId, atSeq, increaseTitle })` → `ctx.sessions.open(childId)`。
- **重新生成**：`ctx.remote.sessions.history({ sessionId, beforeSeq })` 找出本轮提问的 `seq` 与正文，
  `fork` 到该提问处后 `ctx.remote.sessions.prompt({ sessionId, mode:'queue', content:[{type:'text',text}] })` 重跑。
- **i18n**：`ctx.locale.register("rollback", { zh, en })` + `ctx.locale.bind("rollback")`。

## 数据安全

只做「分支式回滚」：**从不删除或改写任何历史日志**。`session.fork` 创建的每条分支都会保留父会话，
原对话永远可回溯（与 DSH 自身的 branch 按钮同源）。所有操作都经 DSH 既有的 `session.*` 客户端 RPC，
不触碰持久化文件。

## 目录

```
dsh-rollback/
  package.json           # dsh.client 元数据 + exports["./client"]
  cordis.patch.yml       # bundle patch（loader 插入条目）
  client/client.js       # 免构建加载成品（__ModuleLoader__ 格式）
  src/client/            # TS 源码：index / RollbackTail / rollback / locales / globals
  tsconfig.json
```

## 许可

MIT
