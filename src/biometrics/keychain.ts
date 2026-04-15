let Keychain: any = null;

const SERVICE = 'NotesApp_PIN';

const loadKeychain = () => {
  if (Keychain !== null) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Keychain = require('react-native-keychain');
  } catch (e) {
    console.warn('react-native-keychain not available; PIN storage disabled.');
    Keychain = false;
  }
};

export const setPin = async (pin: string): Promise<boolean> => {
  try {
    loadKeychain();
    if (!Keychain) return false;
    // store a dummy username with the pin as password
    const res = await Keychain.setGenericPassword('pin', pin, {service: SERVICE});
    return !!res;
  } catch (e) {
    console.warn('Failed to set PIN in keychain', e);
    return false;
  }
};

export const verifyPin = async (pin: string): Promise<boolean> => {
  try {
    loadKeychain();
    if (!Keychain) return false;
    const creds = await Keychain.getGenericPassword({service: SERVICE});
    if (!creds) return false;
    return creds.password === pin;
  } catch (e) {
    console.warn('Failed to verify PIN', e);
    return false;
  }
};

export const hasPin = async (): Promise<boolean> => {
  try {
    loadKeychain();
    if (!Keychain) return false;
    const creds = await Keychain.getGenericPassword({service: SERVICE});
    return !!creds;
  } catch (e) {
    return false;
  }
};

export const removePin = async (): Promise<boolean> => {
  try {
    loadKeychain();
    if (!Keychain) return false;
    await Keychain.resetGenericPassword({service: SERVICE});
    return true;
  } catch (e) {
    console.warn('Failed to remove PIN', e);
    return false;
  }
};
