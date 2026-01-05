import { endianBufferViewFor } from "../endian-buffer.ts";
import type { TDmabufHeapIoctlKernelInterface } from "../kernel-interface.ts";

type TDmabufHeapIoctlAllocateResult = {
  errno: undefined;
  dmabufFd: number;
} | {
  errno: number;
  dmabufFd: undefined;
};

const formatAllocationData = ({
  endianness,
  len,
  fdFlags,
  heapFlags
}: {
  endianness: TDmabufHeapIoctlKernelInterface["endianness"];
  len: number;
  fdFlags: bigint;
  heapFlags: bigint;
}) => {

  const allocationData = new Uint8Array(24);

  const view = endianBufferViewFor({ buffer: allocationData, endianness });

  // struct dma_heap_allocation_data {
  //   __u64 len
  view.writeU64({ offset: 0, value: BigInt(len) });
  //   __u32 fd
  view.writeU32({ offset: 8, value: 0 });
  //   __u32 fd_flags
  view.writeU32({ offset: 12, value: Number(fdFlags) });
  //   __u64 heap_flags
  view.writeU64({ offset: 16, value: heapFlags });
  // }

  return allocationData;
};

const DMA_HEAP_IOCTL_ALLOC = BigInt(0xc0184800);

const createDmabufHeapIoctls = ({
  kernelIoctlInterface
}: {
  kernelIoctlInterface: TDmabufHeapIoctlKernelInterface
}) => {
  const dmabufHeapIoctlAllocate = ({
    dmabufHeapFd,
    size,
    fdFlags,
    heapFlags
  }: {
    dmabufHeapFd: number;
    size: number;
    fdFlags: bigint;
    heapFlags: bigint;
  }): TDmabufHeapIoctlAllocateResult => {

    const allocationData = formatAllocationData({
      endianness: kernelIoctlInterface.endianness,
      len: size,
      fdFlags,
      heapFlags
    });

    const { errno } = kernelIoctlInterface.ioctl({
      fd: dmabufHeapFd,
      request: DMA_HEAP_IOCTL_ALLOC,
      arg: allocationData
    });

    if (errno !== undefined) {
      return {
        errno,
        dmabufFd: undefined
      };
    }

    const view = endianBufferViewFor({ buffer: allocationData, endianness: kernelIoctlInterface.endianness });
    const dmabufFd = view.readU32({ offset: 8 });

    return {
      errno: undefined,
      dmabufFd
    };
  };

  return {
    dmabufHeapIoctlAllocate
  };
};

export {
  createDmabufHeapIoctls
};
