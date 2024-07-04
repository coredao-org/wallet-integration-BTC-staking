import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import ECPairFactory from "ecpair";
import { Provider } from "./provider";
import {
  DEFATUL_BITCOIN_RPC,
  DEFAULT_PRIVKEY,
  RedeemScriptType,
} from "../constants";
import split from "coinselect-segwit/split";
import { parseCLTVScript } from "./script";
import { PsbtInput } from "bip174/src/lib/interfaces";
import { witnessStackToScriptWitness } from "bitcoinjs-lib/src/psbt/psbtutils";

const OPS = bitcoin.script.OPS;

// Initialize the elliptic curve library
const ECPair = ECPairFactory(ecc);

// Verify validator's signature
const validatorSignature = (
  pubkey: Buffer,
  msghash: Buffer,
  signature: Buffer
): boolean => ECPair.fromPublicKey(pubkey).verify(msghash, signature);

const finalCLTVScripts = (
  inputIndex: number,
  input: PsbtInput,
  script: Buffer,
  isSegwit: boolean,
  isP2SH: boolean,
  isP2WSH: boolean
) => {
  try {
    const network = bitcoin.networks.bitcoin;
    const { options, type } = parseCLTVScript({ cltvScript: script });
    const isMultisig =
      type === RedeemScriptType.MULTI_SIG_HASH_SCRIPT ||
      type === RedeemScriptType.MULTI_SIG_SCRIPT;
    const { m } = options;

    const sigNumber = input.partialSig?.length ?? 0;

    if (!input.partialSig || !input.partialSig.length) {
      throw new Error(`Tx was not fully signed`);
    }

    if ((isMultisig && sigNumber !== m!) || sigNumber < 1) {
      throw new Error(`Tx using multi-sig should have at least ${m} signed`);
    }

    const sigScript: (Buffer | number)[] = [];

    switch (type) {
      case RedeemScriptType.MULTI_SIG_SCRIPT: {
        sigScript.push(OPS.OP_0);
        for (let i = 0; i < sigNumber; i += 1) {
          sigScript.push(input.partialSig[i].signature);
        }
        break;
      }
      case RedeemScriptType.PUBLIC_KEY_HASH_SCRIPT: {
        sigScript.push(input.partialSig[0].signature);
        sigScript.push(input.partialSig[0].pubkey);
        break;
      }
      case RedeemScriptType.PUBLIC_KEY_SCRIPT: {
        sigScript.push(input.partialSig[0].signature);
        break;
      }
      default:
        throw new Error("Failed to create script");
    }

    const paymentParams = {
      redeem: {
        input: bitcoin.script.compile(sigScript),
        output: script,
        network,
      },
      network,
    };
    const payment = isP2WSH
      ? bitcoin.payments.p2wsh(paymentParams)
      : bitcoin.payments.p2sh(paymentParams);

    return {
      finalScriptSig: payment.input,
      finalScriptWitness:
        payment.witness && payment.witness.length > 0
          ? witnessStackToScriptWitness(payment.witness)
          : undefined,
    };
  } catch (error: any) {
    throw new Error(error);
  }
};

export const redeemLockedBitcoin = async ({
  from,
  to,
  redeemScript,
}: {
  from: string;
  to: string;
  redeemScript: string | Buffer;
}) => {
  let network;
  let witness = false;
  if (from.length === 34 || from.length === 35) {
    const addr = bitcoin.address.fromBase58Check(from);
    network =
      addr.version === bitcoin.networks.bitcoin.pubKeyHash ||
      addr.version === bitcoin.networks.bitcoin.scriptHash
        ? bitcoin.networks.bitcoin
        : bitcoin.networks.testnet;
  } else {
    const addr = bitcoin.address.fromBech32(from);
    network =
      addr.prefix === bitcoin.networks.bitcoin.bech32
        ? bitcoin.networks.bitcoin
        : bitcoin.networks.testnet;
    witness = true;
  }

  const provider = new Provider({
    network,
    bitcoinRpc: DEFATUL_BITCOIN_RPC,
  });

  const bytesFee = await provider.getFeeRate();

  const keyPair = ECPair.fromPrivateKey(Buffer.from(DEFAULT_PRIVKEY, "hex"));

  const res = await provider.getUTXOs(from);

  const redeemScriptBuf = Buffer.from(redeemScript.toString("hex"), "hex");

  const script = (witness ? bitcoin.payments.p2wsh : bitcoin.payments.p2sh)({
    redeem: {
      output: redeemScriptBuf,
      network,
    },
    network,
  }).output;

  const rawTxMap: Record<string, string> = {};

  if (!witness) {
    for (let i = 0; i < res.length; i++) {
      const utxo = res[i];
      if (!rawTxMap[utxo.txid]) {
        const hex = await provider.getRawTransaction(utxo.txid);
        rawTxMap[utxo.txid] = hex;
      }
    }
  }

  const utxos = res.map((utxo) => ({
    ...utxo,
    ...(!witness && {
      nonWitnessUtxo: Buffer.from(rawTxMap[utxo.txid], "hex"),
    }),
    ...(witness && {
      witnessUtxo: {
        script: script!,
        value: utxo.value,
      },
    }),
    ...(!witness
      ? {
          redeemScript: redeemScriptBuf,
        }
      : {
          witnessScript: redeemScriptBuf,
        }),
  }));

  let { inputs, outputs } = split(
    utxos,
    [
      {
        address: to,
      },
    ],
    bytesFee
  );

  if (!inputs) {
    throw new Error("insufficient balance");
  }

  if (!outputs) {
    throw new Error("failed to caculate transaction fee");
  }
  const { options } = parseCLTVScript({ cltvScript: redeemScript });

  const psbt = new bitcoin.Psbt({
    network,
  });

  psbt.setLocktime(options.lockTime);

  inputs?.forEach((input) =>
    psbt.addInput({
      hash:
        typeof input.txid === "string" ? input.txid : Buffer.from(input.txid),
      index: input.vout,
      ...(input.nonWitnessUtxo
        ? {
            nonWitnessUtxo: Buffer.from(input.nonWitnessUtxo),
          }
        : {}),
      ...(input.witnessUtxo
        ? {
            witnessUtxo: {
              script: Buffer.from(input.witnessUtxo.script),
              value: input.witnessUtxo.value,
            },
          }
        : {}),
      ...(input.redeemScript
        ? { redeemScript: Buffer.from(input.redeemScript) }
        : {}),
      ...(input.witnessScript
        ? { witnessScript: Buffer.from(input.witnessScript) }
        : {}),
      sequence: 0xffffffff - 1,
    })
  );

  outputs?.forEach((output) => {
    psbt.addOutput({
      ...(output.script
        ? { script: Buffer.from(output.script) }
        : { address: output.address! }),
      value: output.value ?? 0,
    });
  });

  inputs.forEach((input, idx) => {
    psbt.signInput(idx, keyPair);
  });

  if (!psbt.validateSignaturesOfAllInputs(validatorSignature)) {
    throw new Error("signature is invalid");
  }

  psbt.txInputs.forEach((input, idx) => {
    psbt.finalizeInput(idx, finalCLTVScripts);
  });

  const txId = await provider.broadcast(psbt.extractTransaction().toHex());
  return txId;
};
