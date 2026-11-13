import { describe, expect, it } from "vitest";
import { mentionsConnections } from "./metrics";
describe("mentionsConnections", () => {
  it("ignores instructions", () => expect(mentionsConnections("Label your boxes and connect them with arrows.")).toBe(false));
  it("flags claims", () => expect(mentionsConnections("I see an arrow from the gateway to the cache.")).toBe(true));
});
