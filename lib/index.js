// dsh-rollback — server-side loader entry.
//
// The real behavior lives in the client bundle (client/client.js), which
// @deepseek-ai/dsh-client-modules serves automatically for packages that
// declare `dsh.client` and appear in the loader stack. This module only has
// to import cleanly and expose a valid Cordis plugin so the loader entry
// (inserted by cordis.patch.yml) mounts.

export const name = 'dsh-rollback'

export function apply(ctx) {
  // Client-only plugin: nothing to mount server-side.
  void ctx
}
