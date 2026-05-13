const mockConnect = jest.fn();
const mockCreateIndex = jest.fn();
const mockCountDocuments = jest.fn();
const mockUpdateOne = jest.fn();
const mockFind = jest.fn();
const mockGenerateUniqueHunNumber = jest.fn();
const mockRunAsSystem = jest.fn(async (callback) => callback());

jest.mock('../connect', () => mockConnect);
jest.mock(
  '@librechat/data-schemas',
  () => ({
    logger: {
      error: jest.fn(),
      info: jest.fn(),
    },
    runAsSystem: mockRunAsSystem,
  }),
  { virtual: true },
);
jest.mock(
  '~/db/models',
  () => ({
    User: {
      collection: {
        createIndex: mockCreateIndex,
      },
      countDocuments: mockCountDocuments,
      find: mockFind,
      updateOne: mockUpdateOne,
    },
  }),
  { virtual: true },
);
jest.mock(
  '~/server/services/HunService',
  () => ({
    generateUniqueHunNumber: mockGenerateUniqueHunNumber,
  }),
  { virtual: true },
);

const { backfillHunNumbers } = require('../backfill-hun-numbers');

const makeCursor = (users) => ({
  lean: () => ({
    cursor: jest.fn(() => users),
  }),
});

describe('backfillHunNumbers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnect.mockResolvedValue(true);
    mockCreateIndex.mockResolvedValue('hunNumber_1');
  });

  it('does not write users during dry run', async () => {
    mockCountDocuments.mockResolvedValue(2);

    const result = await backfillHunNumbers({ dryRun: true, batchSize: 25 });

    expect(mockConnect).toHaveBeenCalled();
    expect(mockRunAsSystem).toHaveBeenCalledTimes(1);
    expect(mockCreateIndex).toHaveBeenCalledWith(
      { hunNumber: 1 },
      { name: 'hunNumber_1', sparse: true, unique: true },
    );
    expect(result).toMatchObject({
      dryRun: true,
      total: 2,
      assigned: 0,
      scanned: 0,
    });
    expect(mockFind).not.toHaveBeenCalled();
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it('assigns HUN numbers to users missing one', async () => {
    mockCountDocuments.mockResolvedValue(2);
    mockFind.mockReturnValue(
      makeCursor([
        { _id: { toString: () => 'user-1' }, email: 'one@example.com' },
        { _id: { toString: () => 'user-2' }, email: 'two@example.com' },
      ]),
    );
    mockGenerateUniqueHunNumber
      .mockResolvedValueOnce('HUN-100-200-300')
      .mockResolvedValueOnce('HUN-111-222-333');
    mockUpdateOne.mockResolvedValue({ modifiedCount: 1 });

    const result = await backfillHunNumbers({ dryRun: false, batchSize: 2 });

    expect(result).toMatchObject({
      dryRun: false,
      total: 2,
      scanned: 2,
      assigned: 2,
      errors: 0,
    });
    expect(result.samples).toEqual([
      { userId: 'user-1', email: 'one@example.com', hunNumber: 'HUN-100-200-300' },
      { userId: 'user-2', email: 'two@example.com', hunNumber: 'HUN-111-222-333' },
    ]);
    expect(mockUpdateOne).toHaveBeenCalledTimes(2);
  });

  it('is idempotent when no users are missing HUN numbers', async () => {
    mockCountDocuments.mockResolvedValue(0);
    mockFind.mockReturnValue(makeCursor([]));

    const result = await backfillHunNumbers({ dryRun: false });

    expect(result).toMatchObject({
      total: 0,
      scanned: 0,
      assigned: 0,
      skipped: 0,
    });
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it('retries when a generated HUN collides during update', async () => {
    mockCountDocuments.mockResolvedValue(1);
    mockFind.mockReturnValue(
      makeCursor([{ _id: { toString: () => 'user-1' }, email: 'one@example.com' }]),
    );
    mockGenerateUniqueHunNumber
      .mockResolvedValueOnce('HUN-100-200-300')
      .mockResolvedValueOnce('HUN-111-222-333');
    mockUpdateOne
      .mockRejectedValueOnce({ code: 11000, keyPattern: { hunNumber: 1 } })
      .mockResolvedValueOnce({ modifiedCount: 1 });

    const result = await backfillHunNumbers({ dryRun: false });

    expect(result.assigned).toBe(1);
    expect(result.samples[0].hunNumber).toBe('HUN-111-222-333');
    expect(mockUpdateOne).toHaveBeenCalledTimes(2);
  });
});
