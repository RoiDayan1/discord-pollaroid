import db from './connection.js';

function ago(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Delete all child rows (votes + options) then the parent rows for the given IDs. */
async function purgePolls(ids: string[]) {
  if (ids.length === 0) return;
  await db.transaction(async (trx) => {
    await trx('poll_votes').whereIn('poll_id', ids).del();
    await trx('poll_options').whereIn('poll_id', ids).del();
    await trx('polls').whereIn('id', ids).del();
  });
}

async function purgeRanks(ids: string[]) {
  if (ids.length === 0) return;
  await db.transaction(async (trx) => {
    await trx('rank_votes').whereIn('rank_id', ids).del();
    await trx('rank_options').whereIn('rank_id', ids).del();
    await trx('ranks').whereIn('id', ids).del();
  });
}

function selectIds(table: string) {
  return db(table).select('id');
}

/**
 * Purge stale data from the database:
 * - Closed polls/ranks older than 7 days
 * - Orphaned creations (message_id IS NULL) older than 1 hour
 * - Abandoned open polls/ranks older than 90 days
 */
export async function runCleanup() {
  const closedCutoff = ago(7);
  const orphanCutoff = ago(1 / 24); // 1 hour
  const staleCutoff = ago(90);

  const [closedPolls, orphanPolls, stalePolls, closedRanks, orphanRanks, staleRanks] =
    await Promise.all([
      selectIds('polls').where({ closed: 1 }).andWhere('created_at', '<', closedCutoff),
      selectIds('polls')
        .where({ closed: 0 })
        .whereNull('message_id')
        .andWhere('created_at', '<', orphanCutoff),
      selectIds('polls').where({ closed: 0 }).andWhere('created_at', '<', staleCutoff),
      selectIds('ranks').where({ closed: 1 }).andWhere('created_at', '<', closedCutoff),
      selectIds('ranks')
        .where({ closed: 0 })
        .whereNull('message_id')
        .andWhere('created_at', '<', orphanCutoff),
      selectIds('ranks').where({ closed: 0 }).andWhere('created_at', '<', staleCutoff),
    ]);

  const toIds = (rows: { id: string }[]) => rows.map((r) => r.id);
  const pollIds = [
    ...new Set([...toIds(closedPolls), ...toIds(orphanPolls), ...toIds(stalePolls)]),
  ];
  const rankIds = [
    ...new Set([...toIds(closedRanks), ...toIds(orphanRanks), ...toIds(staleRanks)]),
  ];

  if (pollIds.length === 0 && rankIds.length === 0) return;

  await purgePolls(pollIds);
  await purgeRanks(rankIds);

  console.log(`[cleanup] Purged ${pollIds.length} polls, ${rankIds.length} ranks`);
}
