/**
 * dsh-rollback core logic.
 *
 * DSH sessions are append-only event logs, so there is no native in-place
 * "rewind" RPC. The faithful adaptation (mirroring both opencode's
 * rollback and DSH's own built-in branch button) is a *branch rollback*:
 * fork the session at the chosen message and continue from there. The
 * original log is preserved as a branch — which is exactly how opencode
 * keeps history while letting you edit a prior message and rewind what
 * came after.
 *
 * Colocated here (pure functions) so the loadable bundle and the unit
 * tests share one implementation.
 */

/**
 * A single history event as returned by session.history:
 * `{ event: { type, seq, time, data }, view? }`.
 */
export interface HistoryEvent {
  event: {
    type: string
    seq: number
    time: number
    data: Record<string, any> & { message?: Record<string, any> }
  }
  view?: unknown
}

/** The minimal remote* call surface this plugin needs. */
export interface SessionsRemote {
  /** session.history — read the event log around a boundary. */
  history(input: { sessionId: string; beforeSeq?: number; maxMessages?: number }): Promise<{ events: HistoryEvent[] }>
  /** session.prompt — (re)send a message. */
  prompt(input: { sessionId: string; mode: 'queue' | 'steer'; content: Array<{ type: 'text'; text: string }> }): Promise<unknown>
}

/** The high-level session service surface (`ctx.sessions`). */
export interface SessionsService {
  /** session.fork → resolves to the child session id. */
  fork(opts: { sessionId: string; atSeq?: number; increaseTitle?: boolean }): Promise<string>
  /** Open a session in the sidebar / active view. */
  open(id: string): unknown
}

/** Shape of a `user/message` event data payload (from the report §4.6). */
export function userText(data: Record<string, any>): string | null {
  const content = data?.content
  if (!Array.isArray(content)) return null
  const text = content
    .filter((part: any): boolean => part?.type === 'text')
    .map((part: any) => part.text ?? '')
    .join('')
  return text === '' ? null : text
}

/**
 * Find the seq + text of the user message that began `turn`, scanning a
 * history window that ends at the closing assistant message (`boundarySeq`,
 * exclusive). DSH logs a `turn/start` right after the user message that
 * seeds it; the user message that precedes this turn's `turn/start` is the
 * one to re-run.
 *
 * Returns `{ cutSeq, text }` where `cutSeq` is the seq to fork at so the
 * turn is discarded (the last event before this turn's `turn/start`), and
 * `text` is the user prompt to re-send. Returns `null` when the prompt
 * cannot be located (caller falls back to a plain rollback).
 */
export function findTurnPrompt(events: HistoryEvent[], turn: number): { cutSeq: number; text: string } | null {
  let turnStartSeq: number | undefined
  let lastUserBeforeTurn: HistoryEvent | undefined

  for (const entry of events) {
    const e = entry.event
    if (e.type === 'turn/start' && e.data?.turn === turn) {
      turnStartSeq = e.seq
      break
    }
    if (e.type === 'user/message') lastUserBeforeTurn = entry
  }

  if (turnStartSeq === undefined) return null
  // cutSeq = the last durable seq before the turn began (so forking there
  // discards the whole turn).
  const cutSeq = Math.max(0, turnStartSeq - 1)

  // The user message that seeded this turn is the most recent user/message
  // whose seq is strictly before turnStartSeq.
  const candidate = lastUserBeforeTurn
  if (candidate === undefined) return null
  const text = userText(candidate.event.data ?? {})
  if (text === null) return null
  return { cutSeq, text }
}

/**
 * Roll back to `atSeq`: fork a new lineage at that point and open it.
 * Returns a user-facing status string key (see locales.ts).
 */
export async function rollbackToSeq(sessions: SessionsService, sessionId: string, atSeq: number): Promise<'forked' | 'error'> {
  try {
    const childId = await sessions.fork({ sessionId, atSeq, increaseTitle: true })
    if (childId) sessions.open(childId)
    return 'forked'
  } catch {
    return 'error'
  }
}

/**
 * Regenerate `turn`: cut everything after its user message, then re-send
 * that user prompt on the continued session. Falls back to a plain
 * rollback-to-here when the prompt cannot be recovered (returns 'noUser').
 */
export async function regenerateTurn(
  sessions: SessionsService,
  remote: SessionsRemote,
  sessionId: string,
  turn: number,
  boundarySeq: number,
): Promise<'regenerated' | 'noUser' | 'error'> {
  let events: HistoryEvent[] = []
  try {
    const res = await remote.history({ sessionId, beforeSeq: boundarySeq + 1, maxMessages: 500 })
    events = res.events ?? []
  } catch {
    events = []
  }

  const found = findTurnPrompt(events, turn)
  if (found === null) {
    // Cannot recover the prompt — at least roll back to the boundary.
    await rollbackToSeq(sessions, sessionId, boundarySeq)
    return 'noUser'
  }

  try {
    const childId = await sessions.fork({ sessionId, atSeq: found.cutSeq, increaseTitle: true })
    const target = childId || sessionId
    await remote.prompt({
      sessionId: target,
      mode: 'queue',
      content: [{ type: 'text', text: found.text }],
    })
    if (childId) sessions.open(childId)
    return 'regenerated'
  } catch {
    return 'error'
  }
}
