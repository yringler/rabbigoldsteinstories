// Bundled by wrangler through `alias` in wrangler.jsonc; typed here so typecheck does not need the
// generated file to exist.
declare module "virtual:units" {
  const pool: import("@goldstein/data").UnitPool;
  export default pool;
}
declare module "virtual:overrides" {
  const overrides: import("@goldstein/playlists/engine").Overrides;
  export default overrides;
}
