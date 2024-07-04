import * as bitcoin from "bitcoinjs-lib";
import { RedeemScriptType } from "../constants";

type CLTVScriptOptions = {
  lockTime: number;
  pubkeys?: string | Buffer[];
  pubkey?: string | Buffer;
  m?: number;
  n?: number;
  witness?: boolean;
  network?: bitcoin.Network;
};

//Function to parse CLTV redeem script.
export function parseCLTVScript({
  cltvScript,
  witness,
}: {
  cltvScript: string | Buffer;
  witness?: boolean;
}): {
  options: CLTVScriptOptions;
  type: RedeemScriptType;
} {
  const unlockScript = Buffer.from(cltvScript.toString("hex"), "hex");
  const OPS = bitcoin.script.OPS;
  const options: CLTVScriptOptions = {
    lockTime: 0,
    witness,
  };
  let redeemScriptType = RedeemScriptType.PUBLIC_KEY_SCRIPT;

  try {
    const decompiled = bitcoin.script.decompile(unlockScript);
    if (
      decompiled &&
      decompiled.length > 4 &&
      decompiled[1] === OPS.OP_CHECKLOCKTIMEVERIFY &&
      decompiled[2] === OPS.OP_DROP
    ) {
      options.lockTime = bitcoin.script.number.decode(decompiled[0] as Buffer);
      if (
        decompiled[decompiled.length - 1] === OPS.OP_CHECKMULTISIG &&
        decompiled.length > 5
      ) {
        const n = +decompiled[decompiled.length - 6] - OPS.OP_RESERVED;
        const m = +decompiled[3] - OPS.OP_RESERVED;
        const publicKeys: any[] = decompiled.slice(4, 4 + n);
        let isValidatePublicKey = true;
        publicKeys.forEach((key: any) => {
          if (key.length !== 33) {
            isValidatePublicKey = false;
          }
        });
        if (m < n && isValidatePublicKey) {
          redeemScriptType = RedeemScriptType.MULTI_SIG_SCRIPT;
          options.n = n;
          options.m = m;
          options.pubkeys = publicKeys;
        }
      } else if (decompiled[decompiled.length - 1] === OPS.OP_CHECKSIG) {
        if (decompiled.length === 5) {
          redeemScriptType = RedeemScriptType.PUBLIC_KEY_SCRIPT;
          options.pubkey = decompiled[3] as any;
        } else if (
          decompiled.length === 8 &&
          decompiled[3] === OPS.OP_DUP &&
          decompiled[4] === OPS.OP_HASH160 &&
          decompiled[6] === OPS.OP_EQUALVERIFY
        ) {
          redeemScriptType = RedeemScriptType.PUBLIC_KEY_HASH_SCRIPT;
        }
      }
    }
    return {
      options,
      type: redeemScriptType,
    };
  } catch (error: any) {
    throw new Error(`Check MultisigScript: ${error}`);
  }
}

export const checkScriptAddress = (payload, network) => {
  let witness = false;
  if (!(payload.address.length === 34 || payload.address.length === 35)) {
    witness = true;
  }
  const redeemScriptBuf = Buffer.from(payload.script.toString("hex"), "hex");
  const script = (witness ? bitcoin.payments.p2wsh : bitcoin.payments.p2sh)({
    redeem: {
      output: redeemScriptBuf,
      network,
    },
    network,
  }).output;
  if (!script) {
    return false;
  }
  const scriptAddress: string = bitcoin.address.fromOutputScript(
    script,
    network
  );
  if (scriptAddress === payload.address) {
    return true;
  }
  return false;
};
