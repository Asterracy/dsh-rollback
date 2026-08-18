// dsh-rollback — client bundle (loadable artifact).
//
// Hand-authored in the DSH client-module format so it can be dropped straight
// into a profile without a build step. The TypeScript source under src/client/
// mirrors this exactly; regenerate with `pnpm build` if you prefer the
// toolchain. It must expose `apply`, `inject`, and `name` (the plugin metadata
// the client-module loader consumes).
window.__ModuleLoader__.load({
  id: "dsh-rollback",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    let react = require("react");
    let react_jsx_runtime = require("react/jsx-runtime");
    const { useState, useCallback, createElement: h } = react;

    // ---- CSS (scoped under the plugin's own data-plugin-css tag) ----
    const css = ".dsh-rollback-row{display:flex;align-items:center;gap:4px;margin:8px 0 2px;flex-wrap:wrap}"
      + ".dsh-rollback-btn{display:inline-flex;align-items:center;gap:4px;font:inherit;font-size:12px;line-height:1;"
      + "color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg);border:1px solid "
      + "var(--dsw-alias-border-l3);border-radius:6px;padding:4px 8px;cursor:pointer;transition:background .12s ease}"
      + ".dsh-rollback-btn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}"
      + ".dsh-rollback-btn:focus-visible{outline:none;box-shadow:inset 0 0 0 2px var(--dsw-alias-border-l3)}"
      + ".dsh-rollback-btn:disabled{opacity:.5;cursor:default}"
      + ".dsh-rollback-state{font-size:12px;color:var(--dsw-alias-label-tertiary);margin-left:4px}";
    const tagId = "dsh-rollback/RollbackTail.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-rollback";
      tag.dataset.pluginCss = tagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    // ---- Locales ----
    const NS = "rollback";
    const zh = {
      "actions.rollbackHere": "↶ 回滚到此",
      "actions.rollbackHereHint": "从这里继续——把这份会话带到这条消息，从它结束的地方继续（原样保留为分支）。",
      "actions.regenerate": "↻ 重新生成本轮",
      "actions.regenerateHint": "放弃本轮回答，回到提问处重新生成（原历史保留为分支）。",
      "toast.loading": "回滚中…",
      "toast.forked": "已回滚，切换到了新分支（原会话保留）。",
      "toast.regenerated": "已重新生成本轮。",
      "toast.error": "回滚失败：{0}",
      "toast.noUserMessage": "未找到本轮的提问内容，已回滚到此继续。"
    };
    const en = {
      "actions.rollbackHere": "↶ Rollback here",
      "actions.rollbackHereHint": "Continue from here — carry this session back to this message and branch from where it ended (the original is kept as a branch).",
      "actions.regenerate": "↻ Regenerate this turn",
      "actions.regenerateHint": "Discard this turn and regenerate from the question (original history is kept as a branch).",
      "toast.loading": "Rolling back…",
      "toast.forked": "Rolled back — switched to a new branch (original session kept).",
      "toast.regenerated": "Turn regenerated.",
      "toast.error": "Rollback failed: {0}",
      "toast.noUserMessage": "Could not find this turn\u2019s prompt; rolled back to continue from here."
    };

    // ---- Core logic (src/client/rollback.ts) ----
    function userText(data) {
      const content = data && data.content;
      if (!Array.isArray(content)) return null;
      let text = "";
      for (const part of content) {
        if (part && part.type === "text" && typeof part.text === "string") text += part.text;
      }
      return text === "" ? null : text;
    }

    function findTurnPrompt(events, turn) {
      let turnStartSeq;
      let lastUserBeforeTurn;
      for (const entry of events) {
        const e = entry.event;
        if (!e) continue;
        if (e.type === "turn/start" && e.data && e.data.turn === turn) {
          turnStartSeq = e.seq;
          break;
        }
        if (e.type === "user/message") lastUserBeforeTurn = entry;
      }
      if (turnStartSeq === undefined) return null;
      const cutSeq = Math.max(0, turnStartSeq - 1);
      const candidate = lastUserBeforeTurn;
      if (!candidate) return null;
      const text = userText(candidate.event.data);
      if (text === null) return null;
      return { cutSeq, text };
    }

    async function rollbackToSeq(sessions, sessionId, atSeq) {
      try {
        const childId = await sessions.fork({ sessionId, atSeq, increaseTitle: true });
        if (childId) sessions.open(childId);
        return "forked";
      } catch (err) {
        console.error("[dsh-rollback] fork failed", err);
        return "error";
      }
    }

    async function regenerateTurn(sessions, remote, sessionId, turn, boundarySeq) {
      let events = [];
      try {
        const res = await remote.sessions.history({ sessionId, beforeSeq: boundarySeq + 1, maxMessages: 500 });
        events = (res && res.events) || [];
      } catch (err) {
        console.error("[dsh-rollback] history load failed", err);
        events = [];
      }
      const found = findTurnPrompt(events, turn);
      if (found === null) {
        await rollbackToSeq(sessions, sessionId, boundarySeq);
        return "noUser";
      }
      try {
        const childId = await sessions.fork({ sessionId, atSeq: found.cutSeq, increaseTitle: true });
        const target = childId || sessionId;
        await remote.sessions.prompt({ sessionId: target, mode: "queue", content: [{ type: "text", text: found.text }] });
        if (childId) sessions.open(childId);
        return "regenerated";
      } catch (err) {
        console.error("[dsh-rollback] regenerate failed", err);
        return "error";
      }
    }

    // ---- RollbackTail component (src/client/RollbackTail.tsx) ----
    function RollbackTail(props) {
      const { turn, seq, sessionId, rollback, regenerate, isLatestTurn, t } = props;
      const [busy, setBusy] = useState(false);
      const [notice, setNotice] = useState(null);

      const act = useCallback(async (fn) => {
        if (busy) return;
        setBusy(true);
        setNotice(null);
        try {
          const msg = await fn();
          setNotice(msg);
        } finally {
          setBusy(false);
        }
      }, [busy]);

      return h("div", { className: "dsh-rollback-row" },
        h("button", {
          type: "button",
          className: "dsh-rollback-btn",
          disabled: busy,
          title: t("actions.rollbackHereHint"),
          onClick: () => act(() => rollback(seq))
        }, t("actions.rollbackHere")),
        isLatestTurn ? h("button", {
          type: "button",
          className: "dsh-rollback-btn",
          disabled: busy,
          title: t("actions.regenerateHint"),
          onClick: () => act(() => regenerate(turn, seq))
        }, t("actions.regenerate")) : null,
        notice !== null ? h("span", { className: "dsh-rollback-state" }, t(notice)) : null
      );
    }

    // ---- Plugin metadata (src/client/index.ts) ----
    const name = "dsh-rollback";
    // Object-form inject = intercept config: the services this plugin touches.
    const inject = ["slots", "locale", "sessions", "remote"];

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-rollback: dictionaries");
      const t = ctx.locale.bind(NS);
      let latestTurn = -1;

      ctx.slots.inject("conversation.chat.turnTail", () =>
        ctx.slots.register(
          {
            name: "conversation.chat.turnTail",
            id: "rollback",
            order: 40,
            locale: NS,
            select: () => true,
            inject: (sessionId) => ({ sessionId, sessions: ctx.sessions, remote: ctx.remote })
          },
          (owner) => {
            latestTurn = Math.max(latestTurn, owner.turn);
            const isLatestTurn = owner.turn === latestTurn;
            const session = owner.sessionId;
            return h(RollbackTail, {
              turn: owner.turn,
              seq: owner.seq,
              sessionId: session,
              isLatestTurn,
              rollback: (atSeq) => rollbackToSeq(ctx.sessions, session, atSeq),
              regenerate: (turn, seq) => regenerateTurn(ctx.sessions, ctx.remote, session, turn, seq),
              t
            });
          }
        )
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.name = name;
    return module.exports;
  }
});
