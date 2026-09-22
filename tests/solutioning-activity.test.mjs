import test from 'node:test';
import assert from 'node:assert/strict';
import { describeListChange, describeTextChange, describeValueChange, describeWorkstreamChanges } from '../lib/solutioningActivity.ts';

test('contributor audit names the person added and removed, even within one minute', () => {
  assert.deepEqual(describeListChange('as contributor', ['Divya Shah'], ['Divya Shah', 'Mark Miller']), [
    'Added Mark Miller as contributor',
  ]);
  assert.deepEqual(describeListChange('as contributor', ['Divya Shah', 'Mark Miller'], ['Mark Miller']), [
    'Removed Divya Shah as contributor',
  ]);
  assert.deepEqual(describeListChange('as contributor', ['Divya Shah'], ['Divya Shah']), []);
});

test('changes show both old and new values, and clearing identifies what was cleared', () => {
  assert.equal(describeValueChange('Lead', 'Divya Shah', 'Mark Miller'), 'Lead changed from Divya Shah to Mark Miller');
  assert.equal(describeValueChange('Assignee for Response v2', 'Divya Shah', null), 'Assignee for Response v2 cleared (was Divya Shah)');
  assert.equal(describeValueChange('Priority', 'High', 'High'), null);
  assert.equal(describeTextChange('Brief', 'Old scope', 'New scope and deadline'), 'Brief changed from "Old scope" to "New scope and deadline"');
});

test('one workstream save reports every changed role by name', () => {
  assert.deepEqual(describeWorkstreamChanges(
    { lead: 'Divya Shah', primaryAssignee: 'Mark Miller', contributors: ['Nina Kowalski'] },
    { lead: 'Mark Miller', primaryAssignee: undefined, contributors: ['Grace Liu'] },
  ), [
    'Lead changed from Divya Shah to Mark Miller',
    'Primary assignee cleared (was Mark Miller)',
    'Added Grace Liu as contributor',
    'Removed Nina Kowalski as contributor',
  ]);
});
