const path = require('path');
const { logger, runAsSystem } = require('@librechat/data-schemas');

require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');

const { User } = require('~/db/models');
const { generateUniqueHunNumber } = require('~/server/services/HunService');

const missingHunFilter = {
  $or: [{ hunNumber: { $exists: false } }, { hunNumber: null }, { hunNumber: '' }],
};

const isDuplicateHunNumberError = (error) => error?.code === 11000 && error?.keyPattern?.hunNumber;

async function ensureHunIndex() {
  await User.collection.createIndex(
    { hunNumber: 1 },
    { unique: true, sparse: true, name: 'hunNumber_1' },
  );
}

async function assignHunNumber(userId) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const hunNumber = await generateUniqueHunNumber();
    try {
      const result = await User.updateOne(
        { _id: userId, ...missingHunFilter },
        { $set: { hunNumber } },
      );
      return result.modifiedCount > 0 ? hunNumber : null;
    } catch (error) {
      if (isDuplicateHunNumberError(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Unable to assign a unique HUN number to user ${userId}`);
}

async function backfillHunNumbers({ dryRun = true, batchSize = 100 } = {}) {
  await connect();

  return runAsSystem(async () => {
    await ensureHunIndex();

    const total = await User.countDocuments(missingHunFilter);
    logger.info('Starting HUN backfill', { dryRun, batchSize, total });

    const results = {
      dryRun,
      total,
      scanned: 0,
      assigned: 0,
      skipped: 0,
      errors: 0,
      samples: [],
    };

    if (dryRun) {
      return results;
    }

    const cursor = User.find(missingHunFilter, { _id: 1, email: 1 }).lean().cursor({ batchSize });

    for await (const user of cursor) {
      results.scanned++;
      try {
        const hunNumber = await assignHunNumber(user._id);
        if (hunNumber) {
          results.assigned++;
          if (results.samples.length < 20) {
            results.samples.push({ userId: user._id.toString(), email: user.email, hunNumber });
          }
        } else {
          results.skipped++;
        }
      } catch (error) {
        results.errors++;
        logger.error('Failed to backfill HUN number', {
          userId: user._id,
          email: user.email,
          error: error.message,
        });
      }
    }

    logger.info('HUN backfill completed', results);
    return results;
  });
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const batchSize =
    parseInt(process.argv.find((arg) => arg.startsWith('--batch-size='))?.split('=')[1], 10) || 100;

  backfillHunNumbers({ dryRun, batchSize })
    .then((result) => {
      console.log('\nHUN Backfill Results:', JSON.stringify(result, null, 2));
      if (dryRun) {
        console.log('\nTo assign HUN numbers, run without --dry-run.');
      }
      process.exit(result.errors > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('HUN backfill failed:', error);
      process.exit(1);
    });
}

module.exports = { backfillHunNumbers };
