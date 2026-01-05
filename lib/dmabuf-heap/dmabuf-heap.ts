import type { TDmabufAllocator } from "../dmabuf-allocator-interface.ts";
import { createDefaultAllocationSizeDeterminer } from "../allocation-size.ts";
import { createDmabufHeapIoctls } from "./dmabuf-heap-ioctl.ts";
import type { TDmabufHeapAllocatorKernelInterface } from "../kernel-interface.ts";
// import nodeFs from "node:fs";

type TDmabufHeap = TDmabufAllocator & {
  dupHeapFd: () => number;
  close: () => void;
};

const O_RDWR = BigInt(0x02);
const O_CLOEXEC = BigInt(0x80000);

const createDmabufHeapFactory = ({ kernelInterface }: { kernelInterface: TDmabufHeapAllocatorKernelInterface }) => {
  const openDmabufHeapAllocatorByDuppingFd = ({
    dmabufHeapFd: providedDmabufHeapFd
  }: {
    dmabufHeapFd: number
  }): TDmabufHeap => {

    const dmabufHeapFd = kernelInterface.dup({ fd: providedDmabufHeapFd });
    const pageSize = kernelInterface.determinePageSize();

    const allocationSizeDeterminer = createDefaultAllocationSizeDeterminer({ pageSize });

    const { dmabufHeapIoctlAllocate } = createDmabufHeapIoctls({ kernelIoctlInterface: kernelInterface });

    const determineOptimalAllocationSize: TDmabufHeap["determineOptimalAllocationSize"] = ({ minimumSize }) => {
      return allocationSizeDeterminer.determineOptimalAllocationSize({ minimumSize });
    };

    const allocate: TDmabufHeap["allocate"] = ({ size }) => {

      const { errno: allocateErrno, dmabufFd } = dmabufHeapIoctlAllocate({
        dmabufHeapFd,
        fdFlags: O_RDWR | O_CLOEXEC,
        heapFlags: BigInt(0),
        size
      });

      if (allocateErrno !== undefined) {
        return {
          // TODO: better
          error: Error(`dmabuf heap allocation failed with errno ${allocateErrno}`),
          handle: undefined
        };
      }

      return {
        error: undefined,
        dmabufFd
      };
    };

    const dupHeapFd: TDmabufHeap["dupHeapFd"] = () => {
      return kernelInterface.dup({ fd: dmabufHeapFd });
    };

    const close = () => {
      kernelInterface.close({ fd: dmabufHeapFd });
    };

    return {
      allocate,
      pageSize,
      determineOptimalAllocationSize,
      dupHeapFd,
      close
    };
  };

  return {
    openDmabufHeapAllocatorByDuppingFd
  };
};

export {
  createDmabufHeapFactory
};

export type {
  TDmabufHeap
};
