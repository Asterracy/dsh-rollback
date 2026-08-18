/**
 * Ambient type stubs for the host surface this external client plugin relies
 * on. The packaged DSH build omits `.d.ts`, so these structural types are
 * declared here (mirroring what dshmarket does for the surface it touches);
 * they are compile-time only and erased at build time.
 */

/** The owner props the `conversation.chat.turnTail` chain hands each renderer. */
export interface TurnTailOwnerProps {
  turn: number
  seq: number
  openFile?: (path: string) => void
  /** Provided by the register's `inject` callback (session-scoped slot). */
  sessionId: string
}

/** Locale service (`ctx.locale`). */
export interface LocaleService {
  register(namespace: string, dicts: { zh: Record<string, string>; en: Record<string, string> }): unknown
  bind(namespace: string): (key: string, params?: Record<string, string>) => string
}

/** Slots service (`ctx.slots`). */
export interface SlotsService {
  inject(name: string, register: () => () => void): void
  register(options: Record<string, unknown>, render: (owner: any) => unknown): () => void
}

/** The subset of `ctx.sessions` this plugin uses. */
export interface SessionsSurface {
  fork(opts: { sessionId: string; atSeq?: number; increaseTitle?: boolean }): Promise<string>
  open(id: string): unknown
}

/** Minimal remote surface (`ctx.remote`). */
export interface RemoteSurface {
  sessions: {
    history(input: { sessionId: string; beforeSeq?: number; maxMessages?: number }): Promise<{ events: any[] }>
    prompt(input: { sessionId: string; mode: 'queue' | 'steer'; content: Array<{ type: 'text'; text: string }> }): Promise<unknown>
  }
}

/** Root client context passed to `apply`. */
export interface RollbackContext {
  effect(callback: () => unknown, label?: string): void
  locale: LocaleService
  slots: SlotsService
  sessions: SessionsSurface
  remote: RemoteSurface
}
