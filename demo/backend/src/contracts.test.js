import { strict as assert } from 'node:assert';
import { BACKFILL_EVENTS, WS_EVENTS } from '../../shared/contracts.js';

function runCase(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log('✅', label))
    .catch((err) => {
      console.error('❌', label, '\n   →', err.message);
      process.exitCode = 1;
    });
}

await runCase('shared workflow/backfill event names match the bilibili spec', () => {
  assert.equal(WS_EVENTS.WORKFLOW_STEP, 'step');
  assert.deepEqual(BACKFILL_EVENTS, {
    PROGRESS: 'backfill.progress',
    DONE: 'backfill.done',
  });
});

if (process.exitCode) {
  console.error('\n🔥 contracts tests failed');
  process.exit(process.exitCode);
} else {
  console.log('\n🎉 contracts tests green');
}
