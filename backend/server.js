const express = require('express');
const { MongoClient } = require('mongodb');
const { createApp } = require('./src/app');

const PORT = parseInt(process.env.PORT || '3000', 10);
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB;

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is required');
}
if (!MONGODB_DB) {
  throw new Error('MONGODB_DB is required');
}

async function start() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(MONGODB_DB);
  const app = createApp({ db, client });

  const server = app.listen(PORT, () => {
    console.log(JSON.stringify({ level: 'info', msg: 'server_started', port: PORT }));
  });

  const shutdown = async () => {
    console.log(JSON.stringify({ level: 'info', msg: 'server_stopping' }));
    server.close(async () => {
      await client.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error(JSON.stringify({ level: 'error', msg: 'startup_failed', error: err.message, stack: err.stack }));
  process.exit(1);
});
