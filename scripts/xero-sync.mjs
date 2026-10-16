#!/usr/bin/env node
// Reads the closing balance of one Xero bank account and writes it to data/progress.json.
//
// Uses a Xero "Custom Connection" app (client-credentials, no browser login needed).
//
// Env vars:
//   XERO_CLIENT_ID, XERO_CLIENT_SECRET   required
//   XERO_ACCOUNT_NAME                    bank account to track, e.g. "Trip Savings" (or use XERO_ACCOUNT_ID)
//   XERO_ACCOUNT_ID                      optional, Xero AccountID instead of the name
//   XERO_BASELINE                        optional, amount already in the account before saving started (subtracted)
//   XERO_TENANT_ID                       optional, only needed if the token covers more than one org
//   XERO_SCOPES                          optional, space-separated scopes to request
//
// Usage:
//   node scripts/xero-sync.mjs           update data/progress.json if the balance changed
//   node scripts/xero-sync.mjs --list    print the bank accounts Xero can see

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../data/progress.json', import.meta.url));
const env = process.env;

function die(msg) {
  console.error(msg);
  process.exit(1);
}

async function getToken() {
  if (!env.XERO_CLIENT_ID || !env.XERO_CLIENT_SECRET) die('XERO_CLIENT_ID and XERO_CLIENT_SECRET must be set.');
  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  if (env.XERO_SCOPES) body.set('scope', env.XERO_SCOPES);
  const res = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${env.XERO_CLIENT_ID}:${env.XERO_CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  if (!res.ok) die(`Xero token request failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function bankSummary(token) {
  const today = new Date().toISOString().slice(0, 10);
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  if (env.XERO_TENANT_ID) headers['Xero-tenant-id'] = env.XERO_TENANT_ID;
  const res = await fetch(`https://api.xero.com/api.xro/2.0/Reports/BankSummary?fromDate=${today}&toDate=${today}`, { headers });
  if (!res.ok) die(`Xero BankSummary request failed: ${res.status} ${await res.text()}`);
  const report = (await res.json()).Reports?.[0];
  if (!report) die('Xero returned no BankSummary report.');

  // Rows: Header, then Section(s) containing Row entries:
  // [Bank Accounts, Opening Balance, Cash Received, Cash Spent, Closing Balance]
  const accounts = [];
  const walk = (rows = []) => {
    for (const row of rows) {
      if (row.RowType === 'Row' && row.Cells?.length) {
        const first = row.Cells[0];
        const id = first.Attributes?.find((a) => a.Id === 'accountID')?.Value;
        const closing = parseFloat(row.Cells[row.Cells.length - 1].Value);
        if (first.Value && Number.isFinite(closing)) accounts.push({ name: first.Value, id, closing });
      }
      if (row.Rows) walk(row.Rows);
    }
  };
  walk(report.Rows);
  return accounts;
}

const token = await getToken();
const accounts = await bankSummary(token);

if (process.argv.includes('--list')) {
  for (const a of accounts) console.log(`${a.name.padEnd(36)} ${a.closing.toFixed(2).padStart(12)}   ${a.id || ''}`);
  process.exit(0);
}

const wantName = env.XERO_ACCOUNT_NAME?.trim().toLowerCase();
const wantId = env.XERO_ACCOUNT_ID?.trim().toLowerCase();
if (!wantName && !wantId) die('Set XERO_ACCOUNT_NAME (or XERO_ACCOUNT_ID). Run with --list to see account names.');
const match = accounts.find((a) => (wantId && a.id?.toLowerCase() === wantId) || (wantName && a.name.toLowerCase() === wantName));
if (!match) die(`No bank account matched. Available: ${accounts.map((a) => a.name).join(', ') || '(none)'}`);

const saved = Math.max(0, Math.round((match.closing - (parseFloat(env.XERO_BASELINE) || 0)) * 100) / 100);

let current = {};
try { current = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* first run */ }
if (current.saved === saved && current.source === 'xero') {
  console.log(`Unchanged: ${saved}`);
  process.exit(0);
}

const next = { saved, updated: new Date().toISOString(), source: 'xero' };
await writeFile(OUT, JSON.stringify(next, null, 2) + '\n');
console.log(`Updated progress.json: ${current.saved ?? '(none)'} -> ${saved} (from "${match.name}")`);
