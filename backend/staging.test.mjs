import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareStaging, stagingDatabasePath } from './staging.mjs'

test('homologação: recusa caminhos de produção e configuração incompleta antes de abrir banco', async () => {
  for (const env of [
    {}, { ACC_STAGING: 'fictitious-only', DATABASE_PATH: '/var/data/acc.sqlite', STAGING_PASSWORD: 'TesteLocalFicticio-2026!' },
    { ACC_STAGING: 'fictitious-only', DATABASE_PATH: stagingDatabasePath, STAGING_PASSWORD: '' },
  ]) await assert.rejects(prepareStaging(env), /Homologação exige|STAGING_PASSWORD/)
})
