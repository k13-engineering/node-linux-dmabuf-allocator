import { createDmabufHeapManager, findDefaultDmabufHeapDevFolder } from "../../lib/dmabuf-heap/dmabuf-heap-manager.ts";
import type { TDmabufHeapKernelInterface } from "../../lib/kernel-interface.ts";
import nodeAssert from "node:assert";

type TMockInfo = {
  readdirCalls: { path: string }[];
  openCalls: { path: string; flags: number, result: ReturnType<TDmabufHeapKernelInterface["open"]> }[];
  closeCalls: { fd: number }[];
  dupCalls: { fd: number }[];
  ioctlCalls: { fd: number; request: bigint; argCopy: Uint8Array }[];
};

type TKernelInterfaceMock = TDmabufHeapKernelInterface & {
  mockInfo: () => TMockInfo;
  setAvailableHeaps: (heaps: string[]) => void;
  setReaddirError: (errno: number | undefined) => void;
  setOpenError: (errno: number | undefined) => void;
};

// eslint-disable-next-line max-statements
const createKernelInterfaceMock = ({
  endianness = "LE"
}: {
  endianness?: "LE" | "BE"
} = {}): TKernelInterfaceMock => {

  let readdirCalls: TMockInfo["readdirCalls"] = [];
  let openCalls: TMockInfo["openCalls"] = [];
  let closeCalls: TMockInfo["closeCalls"] = [];
  let dupCalls: TMockInfo["dupCalls"] = [];
  let ioctlCalls: TMockInfo["ioctlCalls"] = [];

  let availableHeaps: string[] = ["system"];
  let readdirErrno: number | undefined = undefined;
  let openErrno: number | undefined = undefined;
  let nextFd = 100;

  const readdir: TKernelInterfaceMock["readdir"] = ({ path }) => {
    readdirCalls = [...readdirCalls, { path }];

    if (readdirErrno !== undefined) {
      return { errno: readdirErrno, entries: undefined };
    }

    return { errno: undefined, entries: [...availableHeaps] };
  };

  const open: TKernelInterfaceMock["open"] = ({ path, flags }) => {

    let result: ReturnType<TKernelInterfaceMock["open"]>;

    if (openErrno === undefined) {
      const fd = nextFd;
      nextFd += 1;

      result = { errno: undefined, fd };
    } else {
      result = { errno: openErrno, fd: undefined };
    }

    openCalls = [...openCalls, { path, flags, result }];

    return result;
  };

  const close: TKernelInterfaceMock["close"] = ({ fd }) => {
    closeCalls = [...closeCalls, { fd }];
  };

  const dup: TKernelInterfaceMock["dup"] = ({ fd }) => {
    dupCalls = [...dupCalls, { fd }];

    const duppedFd = nextFd;
    nextFd += 1;

    return duppedFd;
  };

  const fcntl: TKernelInterfaceMock["fcntl"] = () => {
    return { errno: undefined };
  };

  const memfd_create: TKernelInterfaceMock["memfd_create"] = () => {
    const memfd = nextFd;
    nextFd += 1;
    return { errno: undefined, memfd };
  };

  const ftruncate: TKernelInterfaceMock["ftruncate"] = () => {
    return { error: undefined };
  };

  const ioctl: TKernelInterfaceMock["ioctl"] = ({ fd, request, arg }) => {
    ioctlCalls = [...ioctlCalls, { fd, request, argCopy: new Uint8Array(arg) }];

    // Mock successful allocation - write a dmabuf fd into the response
    const dataView = new DataView(arg.buffer, arg.byteOffset, arg.byteLength);
    const allocatedFd = nextFd;
    nextFd += 1;

    if (endianness === "LE") {
      dataView.setUint32(8, allocatedFd, true);
    } else {
      dataView.setUint32(8, allocatedFd, false);
    }

    return { errno: undefined, ret: 0n };
  };

  const determinePageSize: TKernelInterfaceMock["determinePageSize"] = () => {
    return 4096;
  };

  const setAvailableHeaps: TKernelInterfaceMock["setAvailableHeaps"] = (heaps: string[]) => {
    availableHeaps = heaps;
  };

  const setReaddirError: TKernelInterfaceMock["setReaddirError"] = (errno: number | undefined) => {
    readdirErrno = errno;
  };

  const setOpenError: TKernelInterfaceMock["setOpenError"] = (errno: number | undefined) => {
    openErrno = errno;
  };

  const mockInfo: TKernelInterfaceMock["mockInfo"] = () => {
    return {
      readdirCalls,
      openCalls,
      closeCalls,
      dupCalls,
      ioctlCalls
    };
  };

  return {
    endianness,
    determinePageSize,
    ioctl,
    dup,
    close,
    readdir,
    open,
    fcntl,
    memfd_create,
    ftruncate,
    mockInfo,
    setAvailableHeaps,
    setReaddirError,
    setOpenError
  };
};

describe("dmabuf-heap-manager", () => {

  describe("findDefaultDmabufHeapDevFolder", () => {
    it("should return the default dmabuf heap dev folder path", () => {
      const result = findDefaultDmabufHeapDevFolder();
      nodeAssert.strictEqual(result, "/dev/dma_heap");
    });
  });

  describe("createDmabufHeapManager", () => {

    it("should throw error if dmabuf heap dev folder cannot be read during initialization", () => {
      const mock = createKernelInterfaceMock();

      const ENOENT = 2;
      mock.setReaddirError(ENOENT);

      nodeAssert.throws(() => {
        createDmabufHeapManager({
          dmabufHeapDevFolder: "/dev/dma_heap",
          kernelInterface: mock
        });
      }, {
        message: /valid dmabuf heap dev folder required/
      });
    });

    it("should successfully initialize when dmabuf heap dev folder exists", () => {
      const mock = createKernelInterfaceMock();
      mock.setAvailableHeaps(["system", "default_cma_region"]);

      const manager = createDmabufHeapManager({
        dmabufHeapDevFolder: "/dev/dma_heap",
        kernelInterface: mock
      });

      nodeAssert.ok(manager);
      nodeAssert.strictEqual(typeof manager.findAvailableDmabufHeapInfos, "function");
      nodeAssert.strictEqual(typeof manager.findDmabufHeapInfosBySpecification, "function");
      nodeAssert.strictEqual(typeof manager.openDmabufHeapByName, "function");
    });

    describe("findAvailableDmabufHeapInfos", () => {

      it("should return heap infos for well-known heaps", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["system", "default_cma_region"]);

        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: "/dev/dma_heap",
          kernelInterface: mock
        });

        const heaps = manager.findAvailableDmabufHeapInfos();

        nodeAssert.strictEqual(heaps.length, 2);

        nodeAssert.strictEqual(heaps[0].name, "system");
        nodeAssert.strictEqual(heaps[0].properties.physicalMemory.contiguous, false);
        nodeAssert.strictEqual(heaps[0].properties.cachable, true);
        nodeAssert.strictEqual(heaps[0].properties.protected, false);

        nodeAssert.strictEqual(heaps[1].name, "default_cma_region");
        nodeAssert.strictEqual(heaps[1].properties.physicalMemory.contiguous, true);
        nodeAssert.strictEqual(heaps[1].properties.cachable, true);
        nodeAssert.strictEqual(heaps[1].properties.protected, false);
      });

      it("should return heap info with undefined properties for unknown heaps", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["custom_heap"]);

        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: "/dev/dma_heap",
          kernelInterface: mock
        });

        const heaps = manager.findAvailableDmabufHeapInfos();

        nodeAssert.strictEqual(heaps.length, 1);
        nodeAssert.strictEqual(heaps[0].name, "custom_heap");
        nodeAssert.strictEqual(heaps[0].properties.physicalMemory.contiguous, undefined);
        nodeAssert.strictEqual(heaps[0].properties.cachable, undefined);
        nodeAssert.strictEqual(heaps[0].properties.protected, undefined);
      });

      it("should throw error when readdir fails", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["system"]);

        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: "/dev/dma_heap",
          kernelInterface: mock
        });

        // Change error after initialization
        const EACCES = 13;
        mock.setReaddirError(EACCES);

        nodeAssert.throws(() => {
          manager.findAvailableDmabufHeapInfos();
        }, {
          message: /failed to read dmabuf heap dev folder.*errno 13/
        });
      });

      it("should call readdir with correct path", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["system"]);

        const customPath = "/custom/dma_heap";
        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: customPath,
          kernelInterface: mock
        });

        manager.findAvailableDmabufHeapInfos();

        const { readdirCalls } = mock.mockInfo();
        nodeAssert.ok(readdirCalls.some((call) => call.path === customPath));
      });
    });

    describe("findDmabufHeapInfosBySpecification", () => {

      it("should filter heaps by required contiguous physical memory", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["system", "default_cma_region"]);

        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: "/dev/dma_heap",
          kernelInterface: mock
        });

        const heaps = manager.findDmabufHeapInfosBySpecification({
          specification: {
            physicalMemory: { contiguous: "required" },
            cachable: "optional",
            protected: "optional"
          }
        });

        nodeAssert.strictEqual(heaps.length, 1);
        nodeAssert.strictEqual(heaps[0].name, "default_cma_region");
      });

      it("should filter heaps by forbidden contiguous physical memory", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["system", "default_cma_region"]);

        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: "/dev/dma_heap",
          kernelInterface: mock
        });

        const heaps = manager.findDmabufHeapInfosBySpecification({
          specification: {
            physicalMemory: { contiguous: "forbidden" },
            cachable: "optional",
            protected: "optional"
          }
        });

        nodeAssert.strictEqual(heaps.length, 1);
        nodeAssert.strictEqual(heaps[0].name, "system");
      });

      it("should filter heaps by required cachable", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["system", "default_cma_region"]);

        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: "/dev/dma_heap",
          kernelInterface: mock
        });

        const heaps = manager.findDmabufHeapInfosBySpecification({
          specification: {
            physicalMemory: { contiguous: "optional" },
            cachable: "required",
            protected: "optional"
          }
        });

        nodeAssert.strictEqual(heaps.length, 2);
      });

      it("should filter heaps by forbidden cachable", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["system"]);

        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: "/dev/dma_heap",
          kernelInterface: mock
        });

        const heaps = manager.findDmabufHeapInfosBySpecification({
          specification: {
            physicalMemory: { contiguous: "optional" },
            cachable: "forbidden",
            protected: "optional"
          }
        });

        nodeAssert.strictEqual(heaps.length, 0);
      });

      it("should filter heaps by required protected", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["system"]);

        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: "/dev/dma_heap",
          kernelInterface: mock
        });

        const heaps = manager.findDmabufHeapInfosBySpecification({
          specification: {
            physicalMemory: { contiguous: "optional" },
            cachable: "optional",
            protected: "required"
          }
        });

        nodeAssert.strictEqual(heaps.length, 0);
      });

      it("should filter heaps by forbidden protected", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["system"]);

        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: "/dev/dma_heap",
          kernelInterface: mock
        });

        const heaps = manager.findDmabufHeapInfosBySpecification({
          specification: {
            physicalMemory: { contiguous: "optional" },
            cachable: "optional",
            protected: "forbidden"
          }
        });

        nodeAssert.strictEqual(heaps.length, 1);
        nodeAssert.strictEqual(heaps[0].name, "system");
      });

      it("should include unknown heaps with preferred specification", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["system", "unknown_heap"]);

        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: "/dev/dma_heap",
          kernelInterface: mock
        });

        const heaps = manager.findDmabufHeapInfosBySpecification({
          specification: {
            physicalMemory: { contiguous: "preferred" },
            cachable: "preferred",
            protected: "optional"
          }
        });

        nodeAssert.strictEqual(heaps.length, 2);
      });

      it("should exclude unknown heaps when required specification cannot be met", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["unknown_heap"]);

        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: "/dev/dma_heap",
          kernelInterface: mock
        });

        const heaps = manager.findDmabufHeapInfosBySpecification({
          specification: {
            physicalMemory: { contiguous: "required" },
            cachable: "optional",
            protected: "optional"
          }
        });

        nodeAssert.strictEqual(heaps.length, 0);
      });

      it("should handle combined specifications", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["system", "default_cma_region"]);

        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: "/dev/dma_heap",
          kernelInterface: mock
        });

        const heaps = manager.findDmabufHeapInfosBySpecification({
          specification: {
            physicalMemory: { contiguous: "required" },
            cachable: "required",
            protected: "forbidden"
          }
        });

        nodeAssert.strictEqual(heaps.length, 1);
        nodeAssert.strictEqual(heaps[0].name, "default_cma_region");
      });
    });

    describe("openDmabufHeapByName", () => {

      it("should successfully open a heap by name", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["system"]);

        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: "/dev/dma_heap",
          kernelInterface: mock
        });

        const result = manager.openDmabufHeapByName({ name: "system" });

        nodeAssert.strictEqual(result.error, undefined);
        nodeAssert.ok(result.dmabufHeap);
      });

      it("should call open with correct path and flags", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["system"]);

        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: "/dev/dma_heap",
          kernelInterface: mock
        });

        manager.openDmabufHeapByName({ name: "system" });

        const O_RDWR = 0x02;
        const O_CLOEXEC = 0x80000;

        const { openCalls } = mock.mockInfo();
        nodeAssert.ok(openCalls.some((call) =>
          call.path === "/dev/dma_heap/system" &&
          call.flags === (O_RDWR | O_CLOEXEC)
        ));
      });

      it("should close the original fd after duping", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["system"]);

        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: "/dev/dma_heap",
          kernelInterface: mock
        });

        manager.openDmabufHeapByName({ name: "system" });

        const { openCalls, closeCalls, dupCalls } = mock.mockInfo();
        nodeAssert.ok(openCalls.length > 0);
        nodeAssert.ok(dupCalls.length > 0);
        nodeAssert.ok(closeCalls.length > 0);

        // The opened fd should have been duped and then closed

        const openCall = openCalls.find((call) => {
          return call.path === "/dev/dma_heap/system";
        });

        nodeAssert.ok(openCall !== undefined);

        const dupedFd = dupCalls.find((call) => call.fd === openCall.result.fd);
        const closedFd = closeCalls.find((call) => call.fd === openCall.result.fd);

        nodeAssert.ok(dupedFd, "opened fd should be duped");
        nodeAssert.ok(closedFd, "opened fd should be closed");
      });

      it("should return error when heap does not exist (ENOENT)", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["system"]);

        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: "/dev/dma_heap",
          kernelInterface: mock
        });

        const ENOENT = 2;
        mock.setOpenError(ENOENT);

        const result = manager.openDmabufHeapByName({ name: "nonexistent" });

        nodeAssert.ok(result.error);
        nodeAssert.strictEqual(result.dmabufHeap, undefined);
        nodeAssert.ok(result.error.message.includes("does not exist"));
      });

      it("should return error when permission denied (EACCES)", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["system"]);

        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: "/dev/dma_heap",
          kernelInterface: mock
        });

        const EACCES = 13;
        mock.setOpenError(EACCES);

        const result = manager.openDmabufHeapByName({ name: "system" });

        nodeAssert.ok(result.error);
        nodeAssert.strictEqual(result.dmabufHeap, undefined);
        nodeAssert.ok(result.error.message.includes("permission denied"));
      });

      it("should return error for other errno values", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["system"]);

        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: "/dev/dma_heap",
          kernelInterface: mock
        });

        const EIO = 5;
        mock.setOpenError(EIO);

        const result = manager.openDmabufHeapByName({ name: "system" });

        nodeAssert.ok(result.error);
        nodeAssert.strictEqual(result.dmabufHeap, undefined);
        nodeAssert.ok(result.error.message.includes(`errno ${EIO}`));
      });

      it("should handle custom dmabuf heap dev folder", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["system"]);

        const customPath = "/custom/path";
        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: customPath,
          kernelInterface: mock
        });

        manager.openDmabufHeapByName({ name: "system" });

        const { openCalls } = mock.mockInfo();
        nodeAssert.ok(openCalls.some((call) => call.path === `${customPath}/system`));
      });

      it("should return heap with working allocate function", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["system"]);

        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: "/dev/dma_heap",
          kernelInterface: mock
        });

        const result = manager.openDmabufHeapByName({ name: "system" });

        nodeAssert.strictEqual(result.error, undefined);
        nodeAssert.ok(result.dmabufHeap);

        // Test that we can allocate
        const allocResult = result.dmabufHeap.allocate({ size: 4096 });
        nodeAssert.strictEqual(allocResult.error, undefined);
        nodeAssert.ok(typeof allocResult.dmabufFd === "number");
      });

      it("should return heap with working dupHeapFd function", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["system"]);

        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: "/dev/dma_heap",
          kernelInterface: mock
        });

        const result = manager.openDmabufHeapByName({ name: "system" });

        nodeAssert.strictEqual(result.error, undefined);
        nodeAssert.ok(result.dmabufHeap);

        const dupedFd = result.dmabufHeap.dupHeapFd();
        nodeAssert.ok(typeof dupedFd === "number");
        nodeAssert.ok(dupedFd >= 0);
      });

      it("should return heap with correct pageSize", () => {
        const mock = createKernelInterfaceMock();
        mock.setAvailableHeaps(["system"]);

        const manager = createDmabufHeapManager({
          dmabufHeapDevFolder: "/dev/dma_heap",
          kernelInterface: mock
        });

        const result = manager.openDmabufHeapByName({ name: "system" });

        nodeAssert.strictEqual(result.error, undefined);
        nodeAssert.ok(result.dmabufHeap);
        nodeAssert.strictEqual(result.dmabufHeap.pageSize, 4096);
      });
    });
  });
});
