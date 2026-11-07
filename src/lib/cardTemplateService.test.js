import test, { mock } from "node:test";
import assert from "node:assert/strict";

const calls = [];
const scoped = {
  async query(sql, params = []) {
    calls.push({ sql, params });
    if (/SELECT school_id FROM schools/i.test(sql)) return [[{ school_id: params[0] }]];
    if (/MAX\(version\)/i.test(sql)) return [[{ latest_version: 3 }]];
    if (/INSERT INTO card_templates/i.test(sql)) return [{ insertId: 41 }];
    throw new Error(`unexpected scoped query: ${sql}`);
  },
};

mock.module("./dbTenant.js", {
  exports: {
    assertTenantId(schoolId) {
      if (!schoolId) throw new Error("missing tenant id");
    },
    async queryTenant(schoolId, sql, params) {
      calls.push({ schoolId, sql, params });
      return [[]];
    },
    async withTenantTransaction(schoolId, work) {
      assert.equal(schoolId, "school-a");
      return work(scoped);
    },
  },
});

const { saveCardTemplate } = await import("./cardTemplates.js");
const { defaultCardTemplate } = await import("./cardTemplateSchema.js");

test("saving a card design creates an immutable next version for the session school", async () => {
  calls.length = 0;
  const saved = await saveCardTemplate("school-a", "Default", defaultCardTemplate, 9);

  assert.equal(saved.id, "41");
  assert.equal(saved.version, 4);
  assert.equal(saved.name, "Default");
  assert.ok(calls.every(({ sql }) => /school_id/i.test(sql)));
  const insert = calls.find(({ sql }) => /INSERT INTO card_templates/i.test(sql));
  assert.deepEqual(insert.params.slice(0, 3), ["school-a", "Default", 4]);
  assert.equal(calls.some(({ sql }) => /UPDATE card_templates/i.test(sql)), false);
});
