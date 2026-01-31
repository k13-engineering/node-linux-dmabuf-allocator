import { createUdmabufAllocatorFactory } from "../../lib/udmabuf/udmabuf-allocator.ts";
import type { TDmabufUdmabufAllocatorKernelInterface } from "../../lib/kernel-interface.ts";
import nodeAssert from "node:assert";

type TMockInfo = {
  ioctlCalls: { fd: number; request: bigint; argCopy: Uint8Array }[];
  memfdCreateCalls: { name: string; flags: number }[];
  ftruncateCalls: { fd: number; length: number }[];
  fcntlCalls: { fd: number; cmd: number; arg: number }[];
  closeCalls: { fd: number }[];
};

type TKernelInterfaceMock = TDmabufUdmabufAllocatorKernelInterface & {
  mockInfo: () => TMockInfo;
  setMemfdCreateError: (errno: number | undefined) => void;
  setFtruncateError: (error: Error | undefined) => void;
  setFcntlError: (errno: number | undefined) => void;
  setIoctlError: (errno: number | undefined) => void;
  setAllocatedDmabufFd: (fd: number) => void;
};

// eslint-disable-next-line max-statements
const createKernelInterfaceMock = ({
  endianness = "LE",
  pageSize = 4096
}: {
  endianness?: "LE" | "BE";
  pageSize?: number;
} = {}): TKernelInterfaceMock => {

  let ioctlCalls: TMockInfo["ioctlCalls"] = [];
  let memfdCreateCalls: TMockInfo["memfdCreateCalls"] = [];
  let ftruncateCalls: TMockInfo["ftruncateCalls"] = [];
  let fcntlCalls: TMockInfo["fcntlCalls"] = [];
  let closeCalls: TMockInfo["closeCalls"] = [];

  let memfdCreateErrno: number | undefined = undefined;
  let ftruncateError: Error | undefined = undefined;
  let fcntlErrno: number | undefined = undefined;
  let ioctlErrno: number | undefined = undefined;

  let nextMemfd = 200;
  let allocatedDmabufFd = 300;

  const determinePageSize: TKernelInterfaceMock["determinePageSize"] = () => {
    return pageSize;
  };

  const memfd_create: TKernelInterfaceMock["memfd_create"] = ({ name, flags }) => {
    memfdCreateCalls = [...memfdCreateCalls, { name, flags }];

    if (memfdCreateErrno !== undefined) {
      return { errno: memfdCreateErrno, memfd: undefined };
    }

    const memfd = nextMemfd;
    nextMemfd += 1;

    return { errno: undefined, memfd };
  };

  const ftruncate: TKernelInterfaceMock["ftruncate"] = ({ fd, length }) => {
    ftruncateCalls = [...ftruncateCalls, { fd, length }];

    if (ftruncateError !== undefined) {
      return { error: ftruncateError };
    }

    return { error: undefined };
  };

  const fcntl: TKernelInterfaceMock["fcntl"] = ({ fd, cmd, arg }) => {
    fcntlCalls = [...fcntlCalls, { fd, cmd, arg }];

    if (fcntlErrno !== undefined) {
      return { errno: fcntlErrno };
    }

    return { errno: undefined };
  };

  const ioctl: TKernelInterfaceMock["ioctl"] = ({ fd, request, arg }) => {
    ioctlCalls = [...ioctlCalls, { fd, request, argCopy: new Uint8Array(arg) }];

    if (ioctlErrno !== undefined) {
      return { errno: ioctlErrno, ret: undefined };
    }

    // The ioctl returns the dmabuf fd via the return value
    return { errno: undefined, ret: BigInt(allocatedDmabufFd) };
  };

  const close: TKernelInterfaceMock["close"] = ({ fd }) => {
    closeCalls = [...closeCalls, { fd }];
  };

  const setMemfdCreateError: TKernelInterfaceMock["setMemfdCreateError"] = (errno) => {
    memfdCreateErrno = errno;
  };

  const setFtruncateError: TKernelInterfaceMock["setFtruncateError"] = (error) => {
    ftruncateError = error;
  };

  const setFcntlError: TKernelInterfaceMock["setFcntlError"] = (errno) => {
    fcntlErrno = errno;
  };

  const setIoctlError: TKernelInterfaceMock["setIoctlError"] = (errno) => {
    ioctlErrno = errno;
  };

  const setAllocatedDmabufFd: TKernelInterfaceMock["setAllocatedDmabufFd"] = (fd) => {
    allocatedDmabufFd = fd;
  };

  const mockInfo: TKernelInterfaceMock["mockInfo"] = () => {
    return {
      ioctlCalls,
      memfdCreateCalls,
      ftruncateCalls,
      fcntlCalls,
      closeCalls
    };
  };

  return {
    endianness,
    determinePageSize,
    ioctl,
    memfd_create,
    ftruncate,
    fcntl,
    close,
    mockInfo,
    setMemfdCreateError,
    setFtruncateError,
    setFcntlError,
    setIoctlError,
    setAllocatedDmabufFd
  };
};

describe("udmabuf-allocator", () => {

  describe("createUdmabufAllocatorFactory", () => {

    it("should create an allocator factory successfully", () => {
      const mock = createKernelInterfaceMock();
      const factory = createUdmabufAllocatorFactory({ kernelInterface: mock });

      nodeAssert.ok(factory);
      nodeAssert.strictEqual(typeof factory.createUdmabufAllocator, "function");
    });

    describe("createUdmabufAllocator", () => {

      it("should create an allocator with correct interface", () => {
        const mock = createKernelInterfaceMock();
        const factory = createUdmabufAllocatorFactory({ kernelInterface: mock });

        const udmabufFd = 42;
        const allocator = factory.createUdmabufAllocator({ udmabufFd });

        nodeAssert.ok(allocator);
        nodeAssert.strictEqual(typeof allocator.allocate, "function");
        nodeAssert.strictEqual(typeof allocator.determineOptimalAllocationSize, "function");
        nodeAssert.strictEqual(typeof allocator.pageSize, "number");
      });

      it("should have correct pageSize", () => {
        const mock = createKernelInterfaceMock({ pageSize: 4096 });
        const factory = createUdmabufAllocatorFactory({ kernelInterface: mock });

        const allocator = factory.createUdmabufAllocator({ udmabufFd: 42 });

        nodeAssert.strictEqual(allocator.pageSize, 4096);
      });

      it("should have correct pageSize for different page sizes", () => {
        const mock = createKernelInterfaceMock({ pageSize: 16384 });
        const factory = createUdmabufAllocatorFactory({ kernelInterface: mock });

        const allocator = factory.createUdmabufAllocator({ udmabufFd: 42 });

        nodeAssert.strictEqual(allocator.pageSize, 16384);
      });

      describe("determineOptimalAllocationSize", () => {

        it("should round up to page size", () => {
          const mock = createKernelInterfaceMock({ pageSize: 4096 });
          const factory = createUdmabufAllocatorFactory({ kernelInterface: mock });
          const allocator = factory.createUdmabufAllocator({ udmabufFd: 42 });

          nodeAssert.strictEqual(allocator.determineOptimalAllocationSize({ minimumSize: 1 }), 4096);
          nodeAssert.strictEqual(allocator.determineOptimalAllocationSize({ minimumSize: 4096 }), 4096);
          nodeAssert.strictEqual(allocator.determineOptimalAllocationSize({ minimumSize: 4097 }), 8192);
          nodeAssert.strictEqual(allocator.determineOptimalAllocationSize({ minimumSize: 8192 }), 8192);
        });

        it("should handle large sizes", () => {
          const mock = createKernelInterfaceMock({ pageSize: 4096 });
          const factory = createUdmabufAllocatorFactory({ kernelInterface: mock });
          const allocator = factory.createUdmabufAllocator({ udmabufFd: 42 });

          // ~8MB for 1080p RGBA
          const size = 1920 * 1080 * 4;
          const expected = Math.ceil(size / 4096) * 4096;
          nodeAssert.strictEqual(allocator.determineOptimalAllocationSize({ minimumSize: size }), expected);
        });
      });

      describe("allocate", () => {

        it("should successfully allocate a dmabuf", () => {
          const mock = createKernelInterfaceMock();
          mock.setAllocatedDmabufFd(123);

          const factory = createUdmabufAllocatorFactory({ kernelInterface: mock });
          const allocator = factory.createUdmabufAllocator({ udmabufFd: 42 });

          const result = allocator.allocate({ size: 4096 });

          nodeAssert.strictEqual(result.error, undefined);
          nodeAssert.strictEqual(result.dmabufFd, 123);
        });

        it("should throw error when size is <= 0", () => {
          const mock = createKernelInterfaceMock();
          const factory = createUdmabufAllocatorFactory({ kernelInterface: mock });
          const allocator = factory.createUdmabufAllocator({ udmabufFd: 42 });

          nodeAssert.throws(() => {
            allocator.allocate({ size: 0 });
          }, {
            message: /size must be > 0/
          });

          nodeAssert.throws(() => {
            allocator.allocate({ size: -4096 });
          }, {
            message: /size must be > 0/
          });
        });

        it("should throw error when size is not a multiple of page size", () => {
          const mock = createKernelInterfaceMock({ pageSize: 4096 });
          const factory = createUdmabufAllocatorFactory({ kernelInterface: mock });
          const allocator = factory.createUdmabufAllocator({ udmabufFd: 42 });

          nodeAssert.throws(() => {
            allocator.allocate({ size: 1000 });
          }, {
            message: /size must be a multiple of 4096/
          });

          nodeAssert.throws(() => {
            allocator.allocate({ size: 5000 });
          }, {
            message: /size must be a multiple of 4096/
          });
        });

        it("should call memfd_create with correct parameters", () => {
          const mock = createKernelInterfaceMock();
          const factory = createUdmabufAllocatorFactory({ kernelInterface: mock });
          const allocator = factory.createUdmabufAllocator({ udmabufFd: 42 });

          allocator.allocate({ size: 4096 });

          const { memfdCreateCalls } = mock.mockInfo();
          nodeAssert.strictEqual(memfdCreateCalls.length, 1);
          nodeAssert.strictEqual(memfdCreateCalls[0].name, "dmabuf_alloc");
          // MFD_ALLOW_SEALING = 0x0002
          nodeAssert.strictEqual(memfdCreateCalls[0].flags, 0x0002);
        });

        it("should return error when memfd_create fails", () => {
          const mock = createKernelInterfaceMock();
          const ENOMEM = 12;
          mock.setMemfdCreateError(ENOMEM);

          const factory = createUdmabufAllocatorFactory({ kernelInterface: mock });
          const allocator = factory.createUdmabufAllocator({ udmabufFd: 42 });

          const result = allocator.allocate({ size: 4096 });

          nodeAssert.ok(result.error);
          nodeAssert.strictEqual(result.dmabufFd, undefined);
          nodeAssert.ok(result.error.message.includes("failed to create memfd"));
          nodeAssert.ok(result.error.message.includes(`errno: ${ENOMEM}`));
        });

        it("should call ftruncate with correct parameters", () => {
          const mock = createKernelInterfaceMock();
          const factory = createUdmabufAllocatorFactory({ kernelInterface: mock });
          const allocator = factory.createUdmabufAllocator({ udmabufFd: 42 });

          const size = 8192;
          allocator.allocate({ size });

          const { ftruncateCalls, memfdCreateCalls } = mock.mockInfo();
          nodeAssert.strictEqual(ftruncateCalls.length, 1);
          nodeAssert.strictEqual(ftruncateCalls[0].fd, memfdCreateCalls[0].flags === 0x0002 ? 200 : ftruncateCalls[0].fd);
          nodeAssert.strictEqual(ftruncateCalls[0].length, size);
        });

        it("should throw error when ftruncate fails", () => {
          const mock = createKernelInterfaceMock();
          mock.setFtruncateError(Error("ftruncate failed"));

          const factory = createUdmabufAllocatorFactory({ kernelInterface: mock });
          const allocator = factory.createUdmabufAllocator({ udmabufFd: 42 });

          nodeAssert.throws(() => {
            allocator.allocate({ size: 4096 });
          }, {
            message: /failed to truncate memfd/
          });
        });

        it("should call fcntl to seal the memfd", () => {
          const mock = createKernelInterfaceMock();
          const factory = createUdmabufAllocatorFactory({ kernelInterface: mock });
          const allocator = factory.createUdmabufAllocator({ udmabufFd: 42 });

          allocator.allocate({ size: 4096 });

          const { fcntlCalls } = mock.mockInfo();
          nodeAssert.strictEqual(fcntlCalls.length, 1);
          // F_ADD_SEALS = 1033
          nodeAssert.strictEqual(fcntlCalls[0].cmd, 1033);
          // F_SEAL_SHRINK = 0x0002
          nodeAssert.strictEqual(fcntlCalls[0].arg, 0x0002);
        });

        it("should throw error when fcntl fails", () => {
          const mock = createKernelInterfaceMock();
          const EINVAL = 22;
          mock.setFcntlError(EINVAL);

          const factory = createUdmabufAllocatorFactory({ kernelInterface: mock });
          const allocator = factory.createUdmabufAllocator({ udmabufFd: 42 });

          nodeAssert.throws(() => {
            allocator.allocate({ size: 4096 });
          }, {
            message: /failed to seal memfd.*errno: 22/
          });
        });

        // eslint-disable-next-line max-statements
        it("should call ioctl with correct parameters", () => {
          const mock = createKernelInterfaceMock();
          const factory = createUdmabufAllocatorFactory({ kernelInterface: mock });

          const udmabufFd = 42;
          const allocator = factory.createUdmabufAllocator({ udmabufFd });

          const size = 4096;
          allocator.allocate({ size });

          const { ioctlCalls, memfdCreateCalls } = mock.mockInfo();
          nodeAssert.strictEqual(ioctlCalls.length, 1);
          nodeAssert.strictEqual(ioctlCalls[0].fd, udmabufFd);

          // UDMABUF_CREATE = 0x40187542n
          nodeAssert.strictEqual(ioctlCalls[0].request, 0x40187542n);

          // Verify the ioctl arg structure (24 bytes)
          const argCopy = ioctlCalls[0].argCopy;
          nodeAssert.strictEqual(argCopy.length, 24);

          const dataView = new DataView(argCopy.buffer, argCopy.byteOffset, argCopy.byteLength);

          // memfd (first 4 bytes, little-endian)
          const memfd = dataView.getUint32(0, true);
          nodeAssert.strictEqual(memfd, memfdCreateCalls[0].flags === 0x0002 ? 200 : memfd);

          // flags (next 4 bytes) - UDMABUF_FLAGS_CLOEXEC = 1
          const flags = dataView.getUint32(4, true);
          nodeAssert.strictEqual(flags, 1);

          // offset (8 bytes, bigint)
          const offset = dataView.getBigUint64(8, true);
          nodeAssert.strictEqual(offset, 0n);

          // size (8 bytes, bigint)
          const allocSize = dataView.getBigUint64(16, true);
          nodeAssert.strictEqual(allocSize, BigInt(size));
        });

        it("should return error when ioctl fails", () => {
          const mock = createKernelInterfaceMock();
          const EINVAL = 22;
          mock.setIoctlError(EINVAL);

          const factory = createUdmabufAllocatorFactory({ kernelInterface: mock });
          const allocator = factory.createUdmabufAllocator({ udmabufFd: 42 });

          const result = allocator.allocate({ size: 4096 });

          nodeAssert.ok(result.error);
          nodeAssert.strictEqual(result.dmabufFd, undefined);
          nodeAssert.ok(result.error.message.includes("failed to create udmabuf"));
          nodeAssert.ok(result.error.message.includes(`errno: ${EINVAL}`));
        });

        it("should close the memfd after allocation (success case)", () => {
          const mock = createKernelInterfaceMock();
          const factory = createUdmabufAllocatorFactory({ kernelInterface: mock });
          const allocator = factory.createUdmabufAllocator({ udmabufFd: 42 });

          allocator.allocate({ size: 4096 });

          const { closeCalls } = mock.mockInfo();
          nodeAssert.strictEqual(closeCalls.length, 1);
          // The memfd should be closed
          nodeAssert.strictEqual(closeCalls[0].fd, 200);
        });

        it("should close the memfd after allocation (error case)", () => {
          const mock = createKernelInterfaceMock();
          const EINVAL = 22;
          mock.setIoctlError(EINVAL);

          const factory = createUdmabufAllocatorFactory({ kernelInterface: mock });
          const allocator = factory.createUdmabufAllocator({ udmabufFd: 42 });

          allocator.allocate({ size: 4096 });

          const { closeCalls } = mock.mockInfo();
          // memfd should still be closed even when ioctl fails
          nodeAssert.strictEqual(closeCalls.length, 1);
          nodeAssert.strictEqual(closeCalls[0].fd, 200);
        });

        // eslint-disable-next-line max-statements
        it("should handle multiple allocations", () => {
          const mock = createKernelInterfaceMock();
          const factory = createUdmabufAllocatorFactory({ kernelInterface: mock });
          const allocator = factory.createUdmabufAllocator({ udmabufFd: 42 });

          const result1 = allocator.allocate({ size: 4096 });
          const result2 = allocator.allocate({ size: 8192 });
          const result3 = allocator.allocate({ size: 16384 });

          nodeAssert.strictEqual(result1.error, undefined);
          nodeAssert.strictEqual(result2.error, undefined);
          nodeAssert.strictEqual(result3.error, undefined);

          const { memfdCreateCalls, ftruncateCalls, fcntlCalls, ioctlCalls, closeCalls } = mock.mockInfo();

          nodeAssert.strictEqual(memfdCreateCalls.length, 3);
          nodeAssert.strictEqual(ftruncateCalls.length, 3);
          nodeAssert.strictEqual(fcntlCalls.length, 3);
          nodeAssert.strictEqual(ioctlCalls.length, 3);
          nodeAssert.strictEqual(closeCalls.length, 3);

          // Verify sizes were passed correctly
          nodeAssert.strictEqual(ftruncateCalls[0].length, 4096);
          nodeAssert.strictEqual(ftruncateCalls[1].length, 8192);
          nodeAssert.strictEqual(ftruncateCalls[2].length, 16384);
        });

        it("should handle large allocation sizes", () => {
          const mock = createKernelInterfaceMock();
          mock.setAllocatedDmabufFd(999);

          const factory = createUdmabufAllocatorFactory({ kernelInterface: mock });
          const allocator = factory.createUdmabufAllocator({ udmabufFd: 42 });

          // 256MB allocation (multiple of page size)
          const largeSize = 256 * 1024 * 1024;
          const result = allocator.allocate({ size: largeSize });

          nodeAssert.strictEqual(result.error, undefined);
          nodeAssert.strictEqual(result.dmabufFd, 999);

          const { ioctlCalls } = mock.mockInfo();
          const argCopy = ioctlCalls[0].argCopy;
          const dataView = new DataView(argCopy.buffer, argCopy.byteOffset, argCopy.byteLength);

          const allocSize = dataView.getBigUint64(16, true);
          nodeAssert.strictEqual(allocSize, BigInt(largeSize));
        });
      });
    });
  });
});
