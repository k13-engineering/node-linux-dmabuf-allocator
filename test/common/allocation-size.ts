import { createDefaultAllocationSizeDeterminer } from "../../lib/allocation-size.ts";
import nodeAssert from "node:assert";

describe("allocation-size", () => {
  [
    {
      size: 1,
      expected: 4096
    },
    {
      size: 2,
      expected: 4096
    },
    {
      size: 3,
      expected: 4096
    },
    {
      size: 42,
      expected: 4096
    },
    {
      size: 128,
      expected: 4096
    },
    {
      size: 4095,
      expected: 4096
    },
    {
      size: 4096,
      expected: 4096
    },
    {
      size: 4097,
      expected: 8192
    }
  ].forEach((size) => {

    const allocationSizeDeterminer = createDefaultAllocationSizeDeterminer({ pageSize: 4096 });

    it(`should align allocation size ${size.size} to ${size.expected}`, () => {
      const optimal = allocationSizeDeterminer.determineOptimalAllocationSize({ minimumSize: size.size });
      nodeAssert.strictEqual(optimal, size.expected);
    });
  });
});
