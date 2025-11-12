// verify-db.js
// CLI script to prove the DB is up and users table is usable.

const {
  testConnection,
  createTestUser,
  getUserByUsername,
  deleteTestUser,
} = require('./db');

(async () => {
  try {
    const now = await testConnection();
    console.log('DB connected. Server time:', now);

    const inserted = await createTestUser();
    console.log('Inserted test user (may be null if already existed):', inserted);

    const fetched = await getUserByUsername('test_user');
    console.log('Fetched test user:', fetched);

    await deleteTestUser();
    const afterDelete = await getUserByUsername('test_user');
    console.log('After delete (should be null):', afterDelete);

    console.log('✅ Read/write verification complete.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  }
})();
