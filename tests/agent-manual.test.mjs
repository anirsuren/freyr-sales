import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {manualFor}=require('../lib/appManual.ts');
test('specific report questions include Reports before generic matching modules', () => {
 const text = manualFor('/agent', 'Explain Customer Offering Heat Map and where its numbers come from');
 assert.match(text, /## Reports and the Customer Offering Heat Map/);
 assert.match(text, /FDL component connections do not supply/);
});
test('Contracts manual delegates access to current settings', () => {
 assert.doesNotMatch(manualFor('/contracts', 'How do I create a contract?'), /ADMIN ONLY/);
});
