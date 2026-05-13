const { z } = require('zod');

const MIN_PASSWORD_LENGTH = parseInt(process.env.MIN_PASSWORD_LENGTH, 10) || 8;

const allowedCharactersRegex = new RegExp(
  '^[' +
    'a-zA-Z0-9_.@#$%&*()' + // Basic Latin characters and symbols
    '\\p{Script=Latin}' + // Latin script characters
    '\\p{Script=Common}' + // Characters common across scripts
    '\\p{Script=Cyrillic}' + // Cyrillic script for Russian, etc.
    '\\p{Script=Devanagari}' + // Devanagari script for Hindi, etc.
    '\\p{Script=Han}' + // Han script for Chinese characters, etc.
    '\\p{Script=Arabic}' + // Arabic script
    '\\p{Script=Hiragana}' + // Hiragana script for Japanese
    '\\p{Script=Katakana}' + // Katakana script for Japanese
    '\\p{Script=Hangul}' + // Hangul script for Korean
    ']+$', // End of string
  'u', // Use Unicode mode
);
const injectionPatternsRegex = /('|--|\$ne|\$gt|\$lt|\$or|\{|\}|\*|;|<|>|\/|=)/i;
const hunNumberRegex = /^HUN-\d{3}-\d{3}-\d{3}$/;
const dateOfBirthRegex = /^\d{4}-\d{2}-\d{2}$/;
const INVALID_DATE_OF_BIRTH_MESSAGE = 'Date of birth must be in YYYY-MM-DD format';
const UNDER_18_MESSAGE = 'Under 18 signup is not allowed at the moment';

const usernameSchema = z
  .string()
  .min(2)
  .max(80)
  .refine((value) => allowedCharactersRegex.test(value), {
    message: 'Invalid characters in username',
  })
  .refine((value) => !injectionPatternsRegex.test(value), {
    message: 'Potential injection attack detected',
  });

const loginSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH)
    .max(128)
    .refine((value) => value.trim().length > 0, {
      message: 'Password cannot be only spaces',
    }),
});

const parseDateOnly = (value) => {
  if (typeof value !== 'string' || !dateOfBirthRegex.test(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
};

const isValidDateOfBirth = (value) => {
  const parsed = parseDateOnly(value);
  if (!parsed) {
    return false;
  }

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const currentDay = now.getUTCDate();

  if (parsed.year > currentYear) {
    return false;
  }
  if (parsed.year === currentYear && parsed.month > currentMonth) {
    return false;
  }
  if (parsed.year === currentYear && parsed.month === currentMonth && parsed.day > currentDay) {
    return false;
  }

  return true;
};

const calculateAge = (value, now = new Date()) => {
  const parsed = parseDateOnly(value);
  if (!parsed) {
    return null;
  }

  let age = now.getUTCFullYear() - parsed.year;
  const currentMonth = now.getUTCMonth() + 1;
  const currentDay = now.getUTCDate();

  if (currentMonth < parsed.month || (currentMonth === parsed.month && currentDay < parsed.day)) {
    age -= 1;
  }

  return age;
};

const isAtLeast18 = (value) => {
  const age = calculateAge(value);
  return age !== null && age >= 18;
};

const createRegisterSchema = ({ requireDateOfBirth = false, requireHun = false } = {}) =>
  z
    .object({
      name: z.string().min(3).max(80),
      username: z
        .union([z.literal(''), usernameSchema])
        .transform((value) => (value === '' ? null : value))
        .optional()
        .nullable(),
      email: z.string().email(),
      password: z
        .string()
        .min(MIN_PASSWORD_LENGTH)
        .max(128)
        .refine((value) => value.trim().length > 0, {
          message: 'Password cannot be only spaces',
        }),
      confirm_password: z
        .string()
        .min(MIN_PASSWORD_LENGTH)
        .max(128)
        .refine((value) => value.trim().length > 0, {
          message: 'Password cannot be only spaces',
        }),
      dateOfBirth: z.string().optional(),
      hunNumber: z.string().optional(),
      hunToken: z.string().optional(),
    })
    .superRefine(({ confirm_password, dateOfBirth, hunNumber, hunToken, password }, ctx) => {
      if (confirm_password !== password) {
        ctx.addIssue({
          code: 'custom',
          message: 'The passwords did not match',
          path: ['confirm_password'],
        });
      }

      if (requireDateOfBirth && !dateOfBirth) {
        ctx.addIssue({
          code: 'custom',
          message: 'Date of birth is required',
          path: ['dateOfBirth'],
        });
      }

      if (dateOfBirth && !isValidDateOfBirth(dateOfBirth)) {
        ctx.addIssue({
          code: 'custom',
          message: INVALID_DATE_OF_BIRTH_MESSAGE,
          path: ['dateOfBirth'],
        });
      } else if (dateOfBirth && !isAtLeast18(dateOfBirth)) {
        ctx.addIssue({
          code: 'custom',
          message: UNDER_18_MESSAGE,
          path: ['dateOfBirth'],
        });
      }

      if (requireHun && !hunNumber) {
        ctx.addIssue({
          code: 'custom',
          message: 'HUN number is required',
          path: ['hunNumber'],
        });
      }

      if (hunNumber && !hunNumberRegex.test(hunNumber)) {
        ctx.addIssue({
          code: 'custom',
          message: 'HUN number must be in HUN-###-###-### format',
          path: ['hunNumber'],
        });
      }

      if (requireHun && !hunToken) {
        ctx.addIssue({
          code: 'custom',
          message: 'HUN token is required',
          path: ['hunToken'],
        });
      }
    });

const registerSchema = createRegisterSchema();

module.exports = {
  loginSchema,
  registerSchema,
  createRegisterSchema,
  calculateAge,
  hunNumberRegex,
  INVALID_DATE_OF_BIRTH_MESSAGE,
  UNDER_18_MESSAGE,
};
