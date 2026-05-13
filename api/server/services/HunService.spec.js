jest.mock('@librechat/data-schemas', () => ({
  runAsSystem: jest.fn((fn) => fn()),
}));
jest.mock('~/models', () => ({
  findUser: jest.fn(),
}));

const { findUser } = require('~/models');
const {
  HUN_REGEX,
  createHunRegistration,
  isHunNumberAvailable,
  verifyHunToken,
} = require('./HunService');

describe('HunService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-hun-secret';
    findUser.mockResolvedValue(null);
  });

  it('creates a valid HUN registration payload', async () => {
    const result = await createHunRegistration();

    expect(result.hunNumber).toMatch(HUN_REGEX);
    expect(result.hunToken).toEqual(expect.any(String));
    expect(verifyHunToken(result.hunNumber, result.hunToken)).toBe(true);
  });

  it('rejects a token for a different HUN number', async () => {
    const result = await createHunRegistration();

    expect(verifyHunToken('HUN-111-222-333', result.hunToken)).toBe(false);
  });

  it('checks HUN number availability globally', async () => {
    findUser.mockResolvedValueOnce({ _id: 'existing-user-id' });

    await expect(isHunNumberAvailable('HUN-198-777-888')).resolves.toBe(false);
  });
});
