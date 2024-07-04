export const MESSAGE_SOURCE = "core-test-wallet";
export const CONTENT_SCRIPT_PORT = "core-test-content-script";
export const DEFATUL_BITCOIN_RPC = "mempool";
export const DEFAULT_ACCOUNT = "bc1qsyzegya3llxhcl22l770utl749m40duvy0zxtd";
export const DEFAULT_PUBKEY = "";
export const DEFAULT_PRIVKEY = "";

export type FeeSpeedType = "slow" | "avg" | "fast";
export enum RedeemScriptType {
  PUBLIC_KEY_SCRIPT = 1,
  PUBLIC_KEY_HASH_SCRIPT,
  MULTI_SIG_SCRIPT,
  MULTI_SIG_HASH_SCRIPT,
}
