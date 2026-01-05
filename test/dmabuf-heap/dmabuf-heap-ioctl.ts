import { createDmabufHeapIoctls } from "../../lib/dmabuf-heap/dmabuf-heap-ioctl.ts";
import type { TDmabufHeapIoctlKernelInterface } from "../../lib/kernel-interface.ts";
import nodeAssert from "node:assert";

type TMockInfo = {
  ioctlCalls: {
    fd: number;
    request: bigint;
    argCopy: Uint8Array
  }[]
};

type IoctlMock = TDmabufHeapIoctlKernelInterface & {
  mockInfo: () => TMockInfo
};

const createIoctlInterfaceMock = ({
  endianness,
  allocFd
}: {
  endianness: IoctlMock["endianness"],
  allocFd: () => number
}): IoctlMock => {

  let ioctlCalls: TMockInfo["ioctlCalls"] = [];

  const ioctl: IoctlMock["ioctl"] = ({ fd: ioctlFd, request, arg }) => {
    ioctlCalls = [
      ...ioctlCalls, {
        fd: ioctlFd,
        request,
        argCopy: new Uint8Array(arg)
      }
    ];

    const dataView = new DataView(arg.buffer, arg.byteOffset, arg.byteLength);

    const fd = allocFd();

    if (endianness === "LE") {
      dataView.setUint32(8, fd, true);
    } else {
      dataView.setUint32(8, fd, false);
    }

    return { errno: undefined, ret: 0 };
  };

  const mockInfo: IoctlMock["mockInfo"] = () => {
    return {
      ioctlCalls
    };
  };

  return {
    endianness,
    ioctl,

    mockInfo
  };
};

describe("dmabuf-heap", () => {
  describe("dmabuf-heap-ioctl", () => {

    it("should format/parse allocation request correctly on little-endian", () => {

      const fdToAllocate = 55;

      const mock = createIoctlInterfaceMock({
        endianness: "LE",
        allocFd: () => fdToAllocate
      });

      const ioctls = createDmabufHeapIoctls({ kernelIoctlInterface: mock });

      const dmabufHeapFd = 42;
      const fdFlags = BigInt(0x1234);
      const heapFlags = BigInt(0x56789abcdef0);
      const size = 64;

      const { errno, dmabufFd } = ioctls.dmabufHeapIoctlAllocate({
        dmabufHeapFd,
        fdFlags,
        heapFlags,
        size
      });

      nodeAssert.strictEqual(errno, undefined);
      nodeAssert.strictEqual(dmabufFd, fdToAllocate);

      const { ioctlCalls } = mock.mockInfo();

      nodeAssert.deepStrictEqual(ioctlCalls, [
        {
          fd: dmabufHeapFd,
          request: BigInt(0xc0184800),
          argCopy: new Uint8Array([
            // len
            64, 0, 0, 0, 0, 0, 0, 0,
            // fd: 0
            0, 0, 0, 0,
            // fd_flags
            52, 18, 0, 0,
            // heap_flags
            240, 222, 188, 154, 120, 86, 0, 0
          ])
        }
      ]);
    });

    it("should format/parse allocation request correctly on big-endian", () => {

      const fdToAllocate = 55;

      const mock = createIoctlInterfaceMock({
        endianness: "BE",
        allocFd: () => fdToAllocate
      });

      const ioctls = createDmabufHeapIoctls({ kernelIoctlInterface: mock });

      const dmabufHeapFd = 42;
      const fdFlags = BigInt(0x1234);
      const heapFlags = BigInt(0x56789abcdef0);
      const size = 64;

      ioctls.dmabufHeapIoctlAllocate({
        dmabufHeapFd,
        fdFlags,
        heapFlags,
        size
      });

      const { ioctlCalls } = mock.mockInfo();

      nodeAssert.deepStrictEqual(ioctlCalls, [
        {
          fd: dmabufHeapFd,
          request: BigInt(0xc0184800),
          argCopy: new Uint8Array([
            // len
            0, 0, 0, 0, 0, 0, 0, 64,
            // fd: 0
            0, 0, 0, 0,
            // fd_flags
            0, 0, 18, 52,
            // heap_flags
            0, 0, 86, 120, 154, 188, 222, 240
          ])
        }
      ]);
    });
  });
});
