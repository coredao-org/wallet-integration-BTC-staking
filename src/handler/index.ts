import * as bitcoin from "bitcoinjs-lib";
import { DEFAULT_ACCOUNT, MESSAGE_SOURCE } from "../constants";
import { parseCLTVScript, checkScriptAddress } from "../core/script";
import { LockedBitcoinStorage } from "../core/storage";
import { redeemLockedBitcoin } from "../core/transaction";

/**
 * @enum {number} RpcErrorCode
 * @description JSON-RPC error codes
 * @see https://www.jsonrpc.org/specification#error_object
 */
export declare enum RpcErrorCode {
  /**
   * Parse error Invalid JSON
   **/
  PARSE_ERROR = -32700,
  /**
   * The JSON sent is not a valid Request object.
   **/
  INVALID_REQUEST = -32600,
  /**
   * The method does not exist/is not available.
   **/
  METHOD_NOT_FOUND = -32601,
  /**
   * Invalid method parameter(s).
   */
  INVALID_PARAMS = -32602,
  /**
   * Internal JSON-RPC error.
   * This is a generic error, used when the server encounters an error in performing the request.
   **/
  INTERNAL_ERROR = -32603,
  /**
   * user rejected/canceled the request
   */
  USER_REJECTION = -32000,
  /**
   * method is not supported for the address provided
   */
  METHOD_NOT_SUPPORTED = -32001,
}

export const handleAddLockedBitcoinRequest = (
  message,
  port: chrome.runtime.Port
) => {
  //TODO: A popup for permission should appear here

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
      //Locked bitcoin added successfully
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
        //Locked bitcoin added successfully
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

export const handleGetLockedBitcoinRequest = async (
  message,
  port: chrome.runtime.Port
) => {
  const { id, params, detail } = message;
  const isJsonRpc = id !== undefined;
  const accountAddress = isJsonRpc ? params : detail.getLockedBitcoinRequest;
  const lockedBitcoin = LockedBitcoinStorage.get(accountAddress);

  chrome.tabs.sendMessage(
    +(port.sender?.tab?.id ?? 0),
    isJsonRpc
      ? {
          id: message.id,
          result: lockedBitcoin ?? {},
          jsonrpc: "2.0",
          source: MESSAGE_SOURCE,
        }
      : {
          source: MESSAGE_SOURCE,
          payload: {
            sendLockedBitcoinRequest: detail.getLockedBitcoinRequest,
            sendLockedBitcoinResponse: lockedBitcoin ?? {},
          },
          method: "getLockedBitcoinRequest",
        }
  );
};

export const handleSendLockedBitcoinRequest = async (
  message,
  port: chrome.runtime.Port
) => {
  //TODO: A popup for confirming sending locked bitcoin should appear here

  const { id, params, detail } = message;

  //JSON-RPC request
  if (id !== undefined) {
    const { from, to } = params;
    const lockedBitcoin = LockedBitcoinStorage.get(DEFAULT_ACCOUNT)[from];
    if (!lockedBitcoin) {
      const invalidParamsError = {
        jsonrpc: "2.0",
        id,
        error: {
          code: RpcErrorCode.INVALID_PARAMS,
          message: "Invalid params",
        },
      };
      port.postMessage(invalidParamsError);
    }

    const { script: redeemScript } = lockedBitcoin;
    const txId = await redeemLockedBitcoin({ from, to, redeemScript });

    chrome.tabs.sendMessage(+(port.sender?.tab?.id ?? 0), {
      id: message.id,
      result: txId,
      jsonrpc: "2.0",
      source: MESSAGE_SOURCE,
    });
  } else {
    const { sendLockedBitcoinRequest } = detail;
    const { from, to } = sendLockedBitcoinRequest;
    const lockedBitcoin = LockedBitcoinStorage.get(DEFAULT_ACCOUNT)[from];
    if (!lockedBitcoin) {
      throw Error("locked bitcoin does not exist");
    }

    const { script: redeemScript } = lockedBitcoin;
    const txId = await redeemLockedBitcoin({ from, to, redeemScript });
    chrome.tabs.sendMessage(+(port.sender?.tab?.id ?? 0), {
      source: MESSAGE_SOURCE,
      payload: {
        sendLockedBitcoinRequest,
        sendLockedBitcoinResponse: txId,
      },
      method: "sendLockedBitcoinRequest",
    });
  }
};
