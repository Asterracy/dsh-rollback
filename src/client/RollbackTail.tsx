/**
 * RollbackTail — the action row rendered in the turn-tail of each completed
 * assistant turn. It receives `TurnTailOwnerProps { turn, seq, openFile }`
 * plus whatever the register's `inject` callback provides
 * (`sessionId`, `sessions`, `remote`, `t`).
 *
 * It offers two opencode-style actions:
 *  - 「↶ 回滚到此」 — branch-rollback to this message and continue from it.
 *  - 「↻ 重新生成本轮」 — discard this turn and re-run its user prompt.
 *
 * Only the latest completed turn can be regenerated (there is nothing before
 * earlier turns to regenerate), but rollback-to-here works on any turn.
 */
import { createElement as h, useState, useCallback } from 'react'

export interface RollbackTailProps {
  turn: number
  seq: number
  openFile?: (path: string) => void
  sessionId: string
  rollback: (atSeq: number) => Promise<string>
  regenerate: (turn: number, seq: number) => Promise<string>
  isLatestTurn: boolean
  t: (key: string, params?: Record<string, string>) => string
}

const css = `
  .dsh-rollback-row{display:flex;align-items:center;gap:4px;margin:8px 0 2px;flex-wrap:wrap}
  .dsh-rollback-btn{display:inline-flex;align-items:center;gap:4px;font:inherit;font-size:12px;line-height:1;
    color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg);border:1px solid
    var(--dsw-alias-border-l3);border-radius:6px;padding:4px 8px;cursor:pointer;transition:background .12s ease}
  .dsh-rollback-btn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
  .dsh-rollback-btn:focus-visible{outline:none;box-shadow:inset 0 0 0 2px var(--dsw-alias-border-l3)}
  .dsh-rollback-btn:disabled{opacity:.5;cursor:default}
  .dsh-rollback-state{font-size:12px;color:var(--dsw-alias-label-tertiary);margin-left:4px}
`

export function RollbackTail(props: RollbackTailProps) {
  const { turn, seq, sessionId, rollback, regenerate, isLatestTurn, t } = props
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const act = useCallback(
    async (fn: () => Promise<string>) => {
      if (busy) return
      setBusy(true)
      setNotice(null)
      try {
        const msg = await fn()
        setNotice(msg)
      } finally {
        setBusy(false)
      }
    },
    [busy],
  )

  return h(
    'div',
    { className: 'dsh-rollback-row' },
    h(
      'button',
      {
        type: 'button',
        className: 'dsh-rollback-btn',
        disabled: busy,
        title: t('actions.rollbackHereHint'),
        onClick: () => act(() => rollback(seq)),
      },
      t('actions.rollbackHere'),
    ),
    isLatestTurn &&
      h(
        'button',
        {
          type: 'button',
          className: 'dsh-rollback-btn',
          disabled: busy,
          title: t('actions.regenerateHint'),
          onClick: () => act(() => regenerate(turn, seq)),
        },
        t('actions.regenerate'),
      ),
    notice !== null && h('span', { className: 'dsh-rollback-state' }, t(notice)),
  )
}
