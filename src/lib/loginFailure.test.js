import test from "node:test";
import assert from "node:assert/strict";

import { getLoginFailureReason } from "./loginFailure.js";

test("login failures are classified without returning credential material", () => {
  assert.equal(getLoginFailureReason(null, false), "account_not_found");
  assert.equal(getLoginFailureReason({ status: "disabled" }, false), "account_inactive");
  assert.equal(getLoginFailureReason({ status: "active" }, false), "password_mismatch");
  assert.equal(getLoginFailureReason({ status: "active" }, true), null);
});
