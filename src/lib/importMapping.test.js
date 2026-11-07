import test from "node:test";
import assert from "node:assert/strict";

import { suggestColumnMapping, validateColumnMapping } from "./importMapping.js";

test("column suggestions normalize case, punctuation, and known synonyms", () => {
  const suggestions = suggestColumnMapping([
    "Student Account Number",
    "Given Name",
    "Family Name",
    "Grade",
  ]);

  assert.equal(suggestions.student_account_no.header, "Student Account Number");
  assert.equal(suggestions.first_name.header, "Given Name");
  assert.equal(suggestions.last_name.header, "Family Name");
  assert.equal(suggestions.class_name.header, "Grade");
  assert.equal(suggestions.first_name.confidence, 0.99);
});

test("fuzzy header and data-shape matches are suggestions that remain explicitly confirmable", () => {
  const fuzzy = suggestColumnMapping(["Studnt Account Number"]);
  const shaped = suggestColumnMapping(
    ["ID"],
    [{ ID: "ST-1" }, { ID: "ST-2" }, { ID: "ST-3" }],
  );

  assert.equal(fuzzy.student_account_no.header, "Studnt Account Number");
  assert.equal(fuzzy.student_account_no.reason, "fuzzy header");
  assert.equal(shaped.student_account_no.header, "ID");
  assert.equal(shaped.student_account_no.reason, "data shape");
  assert.ok(shaped.student_account_no.confidence < 0.8);
});

test("mapping confirmation requires required fields and distinct file columns", () => {
  assert.throws(
    () => validateColumnMapping({ student_account_no: "ID" }, ["ID"]),
    /first name must be mapped/,
  );
  assert.throws(
    () => validateColumnMapping({
      student_account_no: "ID",
      first_name: "ID",
      last_name: "Family",
    }, ["ID", "Family"]),
    /can only be mapped once/,
  );
  assert.deepEqual(
    validateColumnMapping({
      student_account_no: "ID",
      first_name: "Given",
      last_name: "Family",
    }, ["ID", "Given", "Family"]),
    {
      student_account_no: "ID",
      first_name: "Given",
      last_name: "Family",
      gender: "",
      class_name: "",
      stream: "",
      photo_url: "",
      parent_name: "",
      parent_phone: "",
    },
  );
});
