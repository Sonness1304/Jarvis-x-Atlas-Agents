import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createWindowsMcpController, verifyDriverIntegrity } from '../src/windows-mcp-core.mjs';

test('windows-mcp-core enforces observe-before-act and blocks blind replay after OUTCOME_UNKNOWN', async () => {
  let step = 0;
  const controller = createWindowsMcpController({
    backend: {
      async observe(target) {
        return { title: 'TargetApp', target, controls: [{ name: 'Submit', role: 'Button' }] };
      },
      async dispatch() {
        step += 1;
        return { status: step === 1 ? 'OUTCOME_UNKNOWN' : 'CONFIRMED', backend: 'uia' };
      },
      async readback(binding) {
        return { status: 'CONFIRMED', bindingId: binding.bindingId };
      }
    }
  });

  // Action without observe must fail
  await assert.rejects(
    () => controller.callTool('windows_uia_action', { bindingId: 'missing', action: 'click', controlName: 'Submit' }),
    /OBSERVE_BEFORE_ACT_REQUIRED/
  );

  const obs = await controller.callTool('windows_observe_window', {
    pid: 1234,
    windowId: '0x1002',
    processStart: '2026-11-22T01:00:00Z'
  });
  assert.equal(obs.status, 'OBSERVED');

  const act = await controller.callTool('windows_uia_action', {
    bindingId: obs.bindingId,
    action: 'click',
    controlName: 'Submit'
  });
  assert.equal(act.status, 'OUTCOME_UNKNOWN');
  assert.equal(act.replayAllowed, false);

  // Blind replay must be refused until readback resolves state
  await assert.rejects(
    () => controller.callTool('windows_uia_action', { bindingId: obs.bindingId, action: 'click', controlName: 'Submit' }),
    /ANTI_REPLAY_READBACK_REQUIRED/
  );

  const rb = await controller.callTool('windows_readback_state', { bindingId: obs.bindingId });
  assert.equal(rb.status, 'CONFIRMED');
});

test('verifyDriverIntegrity checks exact SHA-256 hash before allowing elevated driver launch', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-drv-'));
  try {
    const bin = path.join(tmp, 'driver.bin');
    fs.writeFileSync(bin, 'signed-driver-bytes', 'utf8');
    const hash = createHash('sha256').update('signed-driver-bytes', 'utf8').digest('hex');

    assert.equal(verifyDriverIntegrity(bin, hash).ok, true);
    assert.equal(verifyDriverIntegrity(bin, '0'.repeat(64)).code, 'DRIVER_INTEGRITY');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
