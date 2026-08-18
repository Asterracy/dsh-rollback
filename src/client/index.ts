/**
 * dsh-rollback client plugin entry.
 *
 * Registers an opencode-style message-rollback action into every completed
 * assistant turn-tail in the DSH conversation view. Works in both the DSH
 * desktop build and the DSH web build — they share the same client plugin
 * system (`dsh.client.platform: "web"`).
 *
 * The plugin attaches to the `conversation.chat.turnTail` chain slot. Each
 * completed turn delivers `{ turn, seq, openFile }`; the session-scoped slot
 * also hands the register's `inject` callback the current `sessionId`.
 * `ctx.sessions` (fork/open) and `ctx.remote` (history/prompt) drive the
 * branch-rollback and regenerate flows.
 */
import { createElement as h } from 'react'
import { RollbackTail } from './RollbackTail.tsx'
import { rollbackToSeq, regenerateTurn } from './rollback.ts'
import { NS, zh, en } from './locales.ts'

export const name = 'dsh-rollback'

/** Services this plugin touches; object-form `inject` = intercept config. */
export const inject = ['slots', 'locale', 'sessions', 'remote']

export function apply(ctx: RollbackContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-rollback: dictionaries')
  const t = ctx.locale.bind(NS)

  // How to know which turn is "latest" so we only offer regenerate there.
  // The turnTail chain gives `turn` (a number). We keep a monotonic max of
  // seen turn ids for the current view; this is a simple and safe heuristic:
  // only the most recently seen turn is offered a regenerate action.
  let latestTurn = -1

  ctx.slots.inject('conversation.chat.turnTail', () =>
    ctx.slots.register(
      {
        name: 'conversation.chat.turnTail',
        id: 'rollback',
        order: 40,
        locale: NS,
        select: () => true,
        inject: (sessionId: string) => ({
          sessionId,
          sessions: ctx.sessions,
          remote: ctx.remote,
        }),
      },
      (owner: TurnTailOwnerProps) => {
        latestTurn = Math.max(latestTurn, owner.turn)
        const isLatestTurn = owner.turn === latestTurn
        const session = owner.sessionId
        return h(RollbackTail, {
          turn: owner.turn,
          seq: owner.seq,
          sessionId: session,
          isLatestTurn,
          rollback: (atSeq) => rollbackToSeq(ctx.sessions, session, atSeq),
          regenerate: (turn, seq) => regenerateTurn(ctx.sessions, ctx.remote, session, turn, seq),
          t,
        })
      },
    ),
  )
}
