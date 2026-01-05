import { createDefaultDmabufHeapManager } from "../../lib/index.ts";

describe("index", () => {
  it("should try to create default dmabuf heap manager", () => {
    try {
      createDefaultDmabufHeapManager();
    } catch (ex) {
      const err = ex as Error;

      if (err.message.includes("valid dmabuf heap dev folder required")) {
        // ignore
      } else {
        throw ex;
      }
    }
  });
});
