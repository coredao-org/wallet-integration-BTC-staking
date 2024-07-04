export interface LockedBitcoinProvider {
  addLockedBitcoin: (params: string) => Promise<boolean>;
  getLockedBitcoin: (
    params: string
  ) => Promise<{ script: string; address: string }[]>;
  sendLockedBitcoin: (params: { from: string; to: string }) => Promise<string>;
}

export const LockedBitcoinMethodsProvider: LockedBitcoinProvider = {
  addLockedBitcoin: async (
    addLockedBitcoinRequest: string
  ): Promise<boolean> => {
    const event = new CustomEvent("add_locked_bitcoin_request", {
      detail: { addLockedBitcoinRequest },
    });

    document.dispatchEvent(event);
    return new Promise((resolve, reject) => {
      const handleMessage = (eventMessage) => {
        if (
          eventMessage.data.payload?.addLockedBitcoinRequest !==
          addLockedBitcoinRequest
        )
          return;
        window.removeEventListener("message", handleMessage);
        if (eventMessage.data.payload?.addLockedBitcoinResponse === false) {
          reject(eventMessage.data.payload?.addLockedBitcoinResponse);
          return;
        }
        resolve(eventMessage.data.payload?.addLockedBitcoinResponse);
      };
      window.addEventListener("message", handleMessage);
    });
  },
  getLockedBitcoin: async (
    getLockedBitcoinRequest: string
  ): Promise<{ script: string; address: string }[]> => {
    const event = new CustomEvent("get_locked_bitcoin_request", {
      detail: { getLockedBitcoinRequest },
    });

    document.dispatchEvent(event);
    return new Promise((resolve, reject) => {
      const handleMessage = (eventMessage) => {
        if (
          eventMessage.data.payload?.getLockedBitcoinRequest !==
          getLockedBitcoinRequest
        )
          return;
        window.removeEventListener("message", handleMessage);
        if (eventMessage.data.payload.getLockedBitcoinResponse === false) {
          reject(eventMessage.data.payload.getLockedBitcoinResponse);
          return;
        }
        resolve(eventMessage.data.payload.getLockedBitcoinResponse);
      };
      window.addEventListener("message", handleMessage);
    });
  },
  sendLockedBitcoin: async (sendLockedBitcoinRequest: {
    from: string;
    to: string;
  }) => {
    const event = new CustomEvent("send_locked_bitcoin_request", {
      detail: { sendLockedBitcoinRequest },
    });

    document.dispatchEvent(event);
    return new Promise((resolve, reject) => {
      const handleMessage = (eventMessage) => {
        if (
          eventMessage.data.payload?.sendLockedBitcoinRequest !==
          sendLockedBitcoinRequest
        )
          return;
        window.removeEventListener("message", handleMessage);
        if (eventMessage.data.payload.sendLockedBitcoinResponse === false) {
          reject(eventMessage.data.payload.sendLockedBitcoinResponse);
          return;
        }
        resolve(eventMessage.data.payload.sendLockedBitcoinResponse);
      };
      window.addEventListener("message", handleMessage);
    });
  },
};

try {
  if (document.currentScript?.dataset.isPriority) {
    Object.defineProperties(window, {
      LockedBitcoinProvider: {
        get: () => LockedBitcoinMethodsProvider,
        set: () => {},
      },
    });
  } else {
    // @ts-ignore
    window.LockedBitcoinProvider =
      LockedBitcoinMethodsProvider as LockedBitcoinProvider;
  }
} catch (e) {
  console.log(
    "Failed setting default provider. Another wallet may have already set it in an immutable way."
  );
  console.error(e);
}
