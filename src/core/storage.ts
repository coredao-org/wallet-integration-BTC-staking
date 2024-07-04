const LOCKED_BITCOIN_MAP_KEY = "CORE_LOCKED_BITCOIN_MAP_KEY";

export interface LockedBitcoin {
  script: string;
  lockTime: string | number;
}

export interface LockedBitcoinMap {
  //  account
  [key: string]: {
    //  address
    [key: string]: LockedBitcoin;
  };
}

export const LockedBitcoinStorage = {
  get: async (
    accountAddress: string
  ): Promise<{
    [key: string]: LockedBitcoin;
  }> => {
    const old = await LockedBitcoinStorage.getAll();
    return old[accountAddress];
  },
  exist: async (accountAddress?: string): Promise<boolean> => {
    if (!accountAddress) return false;
    const old = await LockedBitcoinStorage.getAll();
    if (!old[accountAddress]) return false;
    if (Object.keys(old[accountAddress]).length === 0) return false;
    return true;
  },
  getAll: async (): Promise<LockedBitcoinMap> => {
    const value = localStorage.getItem(LOCKED_BITCOIN_MAP_KEY);
    if (value) {
      return JSON.parse(value);
    }
    return {};
  },
  add: async (
    address: string,
    script: string,
    accountAddress: string,
    lockTime: number
  ) => {
    const old = await LockedBitcoinStorage.getAll();
    if (!old[accountAddress]) {
      old[accountAddress] = {};
    }
    old[accountAddress][address] = { script, lockTime };
    localStorage.setItem(LOCKED_BITCOIN_MAP_KEY, JSON.stringify(old));
  },
  remove: async (address: string) => {
    const old = await LockedBitcoinStorage.getAll();

    // eslint-disable-next-line no-restricted-syntax, guard-for-in
    for (const accountAddress in old) {
      const accountMap = old[accountAddress];
      if (address in accountMap) delete accountMap[address];
    }

    localStorage.setItem(LOCKED_BITCOIN_MAP_KEY, JSON.stringify(old));
  },
};
