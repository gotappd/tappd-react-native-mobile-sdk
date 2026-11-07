/**
 * Reserved keys for SDK/system-managed customer profile fields (not custom attributes).
 * Keep in sync with packages/shared/cjs/customerSystemAttributeKeys.cjs (do not add a runtime dependency on @tappd/shared for npm installs).
 */
export const CUSTOMER_SYSTEM_ATTRIBUTE_KEYS = Object.freeze({
  TIMEZONE: 'timezone',
  LOCALE: 'locale',
  COUNTRY: 'country',
  CITY: 'city',
  LAST_DEVICE_NAME: 'last_device_name',
} as const);

export const CUSTOMER_SYSTEM_ATTRIBUTE_KEY_LIST = Object.freeze(
  Object.values(CUSTOMER_SYSTEM_ATTRIBUTE_KEYS) as readonly string[]
);
