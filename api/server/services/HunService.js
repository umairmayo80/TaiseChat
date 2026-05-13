const jwt = require('jsonwebtoken');
const { randomInt } = require('node:crypto');
const { runAsSystem } = require('@librechat/data-schemas');
const { findUser } = require('~/models');

const HUN_REGEX = /^HUN-\d{3}-\d{3}-\d{3}$/;
const HUN_TOKEN_PURPOSE = 'hun-registration';
const HUN_MAX_ATTEMPTS = 50;

const getHunSecret = () => {
  const secret = process.env.HUN_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('HUN token secret is not configured');
  }
  return secret;
};

const generateHunNumber = () => {
  const segment = () => randomInt(100, 1000).toString();
  return `HUN-${segment()}-${segment()}-${segment()}`;
};

const findUserByHunNumber = async (hunNumber) =>
  runAsSystem(async () => findUser({ hunNumber }, '_id hunNumber'));

const isHunNumberAvailable = async (hunNumber) => {
  if (!HUN_REGEX.test(hunNumber)) {
    return false;
  }
  const existingUser = await findUserByHunNumber(hunNumber);
  return !existingUser;
};

const generateUniqueHunNumber = async () => {
  for (let attempt = 0; attempt < HUN_MAX_ATTEMPTS; attempt++) {
    const hunNumber = generateHunNumber();
    if (await isHunNumberAvailable(hunNumber)) {
      return hunNumber;
    }
  }

  throw new Error('Unable to generate a unique HUN number');
};

const signHunToken = (hunNumber) =>
  jwt.sign({ hunNumber, purpose: HUN_TOKEN_PURPOSE }, getHunSecret(), { expiresIn: '30m' });

const verifyHunToken = (hunNumber, hunToken) => {
  if (!HUN_REGEX.test(hunNumber) || !hunToken) {
    return false;
  }

  try {
    const payload = jwt.verify(hunToken, getHunSecret());
    return payload?.purpose === HUN_TOKEN_PURPOSE && payload?.hunNumber === hunNumber;
  } catch {
    return false;
  }
};

const createHunRegistration = async () => {
  const hunNumber = await generateUniqueHunNumber();
  return {
    hunNumber,
    hunToken: signHunToken(hunNumber),
  };
};

module.exports = {
  HUN_REGEX,
  createHunRegistration,
  generateHunNumber,
  generateUniqueHunNumber,
  isHunNumberAvailable,
  signHunToken,
  verifyHunToken,
};
