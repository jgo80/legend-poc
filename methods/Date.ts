import { DateTime } from 'luxon';

const ISO8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;

const fromString = <T extends Record<string, any>>(obj: T): T => {
  // Iterate over the object's properties
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      // Check if the value is a string and matches the ISO 8601 format
      if (typeof value === 'string' && ISO8601.test(value)) {
        // Convert to Luxon DateTime object
        obj[key] = DateTime.fromISO(value) as any;
      } else if (typeof value === 'object' && value !== null) {
        // Recursively process nested objects
        fromString(value);
      }
    }
  }
  return obj;
};

const toString = <T extends Record<string, any>>(obj: T): T => {
  // Iterate over the object's properties
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key] as DateTime;
      // Check if the value is a Luxon DateTime object
      if (DateTime.isDateTime(value)) {
        // Convert to ISO 8601 string
        obj[key] = value.toISO() as any;
      } else if (typeof value === 'object' && value !== null) {
        // Recursively process nested objects
        toString(value);
      }
    }
  }
  return obj;
};
