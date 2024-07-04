# Wallet Integration to Core BTC Staking
Core built its BTC staking function based on Bitcoin native CLTV timelock technology. For more technical details, please visit https://docs.coredao.org/docs/Learn/products/btc-staking/overview.
At the moment, users are able to use many web wallets to stake BTC to the Core network and earn CORE rewards. And the list of supported wallets are growing rapidly. 

However, there are some UI display issues with most wallets. Core designed a CLTV enabled redeem script and generated a P2SH/P2WSH script address as the staking transaction output. Most wallets, by default, only support standard addresses such as P2WPKH and P2TR. As a result, the staked BTC on Core (CLTV script P2SH/P2WSH address) can not be detected and displayed. Users might feel the staked BTC assets are gone if not familiar with the underneath technologies. 

In order to provide users better UI experiences, we created this repository for wallet teams to improve their product and integrate Core BTC staking feature seamlessly. 

## Redeem Script

Below is the redeem script design

```python
<Absolute Timestamp> OP_CHECKLOCKTIMEVERIFY OP_DROP OP_DUP OP_HASH160 <pubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
```

By using this script, the staking transaction output becomes a timelocked-P2PKH or timelocked-P2WPKH address. 

A new P2SH/P2WSH address will be generated as long as a new <Absolute Timestamp> is picked as the locktime using a given private key. By default, wallets do not recognize these addresses which causes the issue discussed above.  


## Import Script

Wallets can import the redeem script of a CLTV address and parse it. Below is the sample code on how to. 

```javascript

//Function to parse CLTV redeem script.
function parseCLTVScript({
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

// ...

//Parse the CLTV redeem script and save it to storage.
const handleAddLockedBitcoinRequest = (
  message,
  port: chrome.runtime.Port
) => {
  const { id, params } = message;

  //JSON-RPC request
  if (id !== undefined) {
    const invalidParamsError = {
      jsonrpc: "2.0",
      id,
      error: {
        code: RpcErrorCode.INVALID_PARAMS,
        message: "Invalid params",
      },
    };

    //Check address
    if (
      !params?.script ||
      !params?.address ||
      !checkScriptAddress(params, bitcoin.networks.bitcoin)
    ) {
      port.postMessage(invalidParamsError);
      return;
    }

    const { options } = parseCLTVScript({ cltvScript: params.script });

    if (options.lockTime) {
      LockedBitcoinStorage.add(
        params.address,
        params.script,
        DEFAULT_ACCOUNT,
        options.lockTime
      );
      //Added successfully
      chrome.tabs.sendMessage(+(port.sender?.tab?.id ?? 0), {
        id: message.id,
        result: true,
        jsonrpc: "2.0",
        source: MESSAGE_SOURCE,
      });
    } else {
      port.postMessage(invalidParamsError);
    }
    return;
  } else {
    try {
      const { addLockedBitcoinRequest } = message.detail;
      const params = JSON.parse(addLockedBitcoinRequest);

      if (
        !params?.script ||
        !params?.address ||
        !checkScriptAddress(params, bitcoin.networks.bitcoin)
      ) {
        throw Error("invalid params");
      }

      const { options } = parseCLTVScript({ cltvScript: params.script });

      if (options.lockTime) {
        LockedBitcoinStorage.add(
          params.address,
          params.script,
          DEFAULT_ACCOUNT,
          options.lockTime
        );
        //Added successfully
        chrome.tabs.sendMessage(+(port.sender?.tab?.id ?? 0), {
          source: MESSAGE_SOURCE,
          payload: {
            addLockedBitcoinRequest,
            addLockedBitcoinResponse: true,
          },
          method: "addLockedBitcoinRequest",
        });
      } else {
        throw Error("invalid lock time");
      }
    } catch (e) {}
  }
};

```
Note that Core staking website will provide a shortcut button for each CLTV address. Once a user clicks the button, supported wallets will popup for users and the script will be transmitted to the chosen one. However, it is each wallet team’s choice to support importing the redeem script in their own way, as long as it is friendly to users. 


## Improve User Interface

After the wallet successfully imported and parsed CLTV addresses, it is recommended to improve UI for at least following areas

* Display all imported addresses and corresponding amount, remaining locktime, etc.
* Reflect the locked BTC assets in balance displays. 



## Spend Expired CLTV

Once the timelock is expired on any given CLTV addresses, the wallet should reflect the status change. More importantly, being able to spend them. Below is the sample code on how to. 

```javascript

const redeemLockedBitcoin = async ({
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

```

