/**
 * dsh-rollback locale dictionaries.
 *
 * The `rollback` namespace is owned by this plugin. `zh` is the key-set
 * source of truth; `en` mirrors the same key set.
 */
export const NS = 'rollback'

export interface Dict {
  [key: string]: string
}

export const zh: Dict = {
  'actions.rollbackHere': '↶ 回滚到此',
  'actions.rollbackHereHint': '从这里继续——把这份会话带到这条消息，从它结束的地方继续（原样保留为分支）。',
  'actions.regenerate': '↻ 重新生成本轮',
  'actions.regenerateHint': '放弃本轮回答，回到提问处重新生成（原历史保留为分支）。',
  'actions.undoLast': '⟲ 撤销上一条',
  'actions.undoLastHint': '回滚到上一轮结束的位置。',
  'toast.loading': '回滚中…',
  'toast.forked': '已回滚，切换到了新分支（原会话保留）。',
  'toast.regenerated': '已重新生成本轮。',
  'toast.error': '回滚失败：{0}',
  'toast.noUserMessage': '未找到本轮的提问内容，已回滚到此继续。',
}

export const en: Dict = {
  'actions.rollbackHere': '↶ Rollback here',
  'actions.rollbackHereHint': 'Continue from here — carry this session back to this message and branch from where it ended (the original is kept as a branch).',
  'actions.regenerate': '↻ Regenerate this turn',
  'actions.regenerateHint': 'Discard this turn and regenerate from the question (original history is kept as a branch).',
  'actions.undoLast': '⟲ Undo last',
  'actions.undoLastHint': 'Roll back to the end of the previous turn.',
  'toast.loading': 'Rolling back…',
  'toast.forked': 'Rolled back — switched to a new branch (original session kept).',
  'toast.regenerated': 'Turn regenerated.',
  'toast.error': 'Rollback failed: {0}',
  'toast.noUserMessage': 'Could not find this turn’s prompt; rolled back to continue from here.',
}
