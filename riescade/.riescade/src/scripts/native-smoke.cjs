const { app } = require('electron');

app.whenReady().then(() => {
  const Database = require('better-sqlite3');
  const database = new Database(':memory:');
  const result = database.prepare('SELECT 1 AS value').get();
  database.close();

  if (result.value !== 1) throw new Error('Unexpected SQLite smoke-test result.');
  console.log('BETTER_SQLITE3_ELECTRON_OK');
  app.quit();
}).catch(error => {
  console.error(error);
  app.exit(1);
});
