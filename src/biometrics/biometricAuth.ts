let ReactNativeBiometrics: any = null;

const loadBiometrics = () => {
  if (ReactNativeBiometrics !== null) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ReactNativeBiometrics = require('react-native-biometrics').default;
  } catch (e) {
    console.warn('react-native-biometrics not available; biometric auth disabled.');
    ReactNativeBiometrics = false;
  }
};

export const isSensorAvailable = async (): Promise<boolean> => {
  try {
    loadBiometrics();
    if (!ReactNativeBiometrics) return false;
    const result = await ReactNativeBiometrics.isSensorAvailable();
    return !!(result && (result.biometryType || result.available));
  } catch (e) {
    return false;
  }
};

export const promptBiometric = async (reason = 'Authenticate'): Promise<boolean> => {
  try {
    loadBiometrics();
    if (!ReactNativeBiometrics) return false;
    const res = await ReactNativeBiometrics.simplePrompt({promptMessage: reason});
    return !!res.success;
  } catch (e) {
    return false;
  }
};
