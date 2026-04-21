import { strict as assert } from 'node:assert';
import { buildWorkflowBeginPayload } from './server.js';

function runCase(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log('✅', label))
    .catch((err) => {
      console.error('❌', label, '\n   →', err.message);
      process.exitCode = 1;
    });
}

await runCase('workflow.begin payload only includes run_id and user_id', () => {
  assert.deepEqual(
    buildWorkflowBeginPayload({
      runId: 'run_demo_1',
      userId: 'demo-user',
      clientId: 'client-secret',
      text: '别把这句广播出去',
    }),
    {
      run_id: 'run_demo_1',
      user_id: 'demo-user',
    },
  );
});

if (process.exitCode) {
  console.error('\n🔥 server payload tests failed');
  process.exit(process.exitCode);
} else {
  console.log('\n🎉 server payload tests green');
}
