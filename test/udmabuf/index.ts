import { createDefaultUdmabufAllocator } from "../../lib/udmabuf/index.ts";
import nodeAssert from "node:assert";

describe("udmabuf/index", () => {

  describe("createDefaultUdmabufAllocator", () => {

    // eslint-disable-next-line max-statements
    it("should try to create default udmabuf allocator and allocate a buffer", () => {
      let allocator;

      try {
        allocator = createDefaultUdmabufAllocator();
      } catch (ex) {
        const err = ex as Error;

        if (err.message.includes("failed to open /dev/udmabuf")) {
          // udmabuf kernel module not loaded, skip test
          return;
        }

        throw ex;
      }

      nodeAssert.ok(allocator);
      nodeAssert.strictEqual(typeof allocator.allocate, "function");
      nodeAssert.strictEqual(typeof allocator.determineOptimalAllocationSize, "function");
      nodeAssert.strictEqual(typeof allocator.pageSize, "number");
      nodeAssert.ok(allocator.pageSize > 0);

      // Allocate a real udmabuf on the system
      const size = allocator.determineOptimalAllocationSize({ minimumSize: 4096 });
      const { error, dmabufFd } = allocator.allocate({ size });

      nodeAssert.strictEqual(error, undefined);
      nodeAssert.ok(typeof dmabufFd === "number");
      nodeAssert.ok(dmabufFd >= 0);
    });
  });
});
