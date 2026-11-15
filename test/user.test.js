import assert from "node:assert/strict";
import test from "node:test";
import User from "../src/models/User.js";

test("user hashes passwords and omits password hash from safe output", async () => {
  const user = new User({ email: "LEARNER@example.com", name: "Learner", passwordHash: "temporary" });
  await user.setPassword("strong-password");

  assert.equal(user.email, "learner@example.com");
  assert.equal(await user.comparePassword("strong-password"), true);
  assert.equal("passwordHash" in user.toSafeJSON(), false);
});
