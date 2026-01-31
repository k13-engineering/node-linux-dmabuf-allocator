import { type TDmabufAllocator } from "../dmabuf-allocator-interface.ts";
import { createDefaultAllocationSizeDeterminer } from "../allocation-size.ts";
import { type TDmabufHeap } from "../dmabuf-heap/dmabuf-heap.ts";
import { type TDmabufUdmabufAllocatorKernelInterface } from "../kernel-interface.ts";

type TUdmabufCreateResult = {
  errno: number;
  dmabufFd: undefined;
} | {
  errno: undefined;
  dmabufFd: number;
};

const UDMABUF_FLAGS_CLOEXEC = 1 << 0;
const UDMABUF_CREATE = 0x40187542n;

const F_ADD_SEALS = 1033;
const F_SEAL_SHRINK = 0x0002;

const MFD_ALLOW_SEALING = 0x0002;

const createUdmabufAllocatorFactory = ({ kernelInterface }: { kernelInterface: TDmabufUdmabufAllocatorKernelInterface }) => {

  const udmabufCreate = ({ udmabufFd, memfd, size }: { udmabufFd: number, memfd: number; size: number }): TUdmabufCreateResult => {

    const flags = UDMABUF_FLAGS_CLOEXEC;
    const offset = 0n;

    const udmabufCreateStruct = Buffer.alloc(24);
    udmabufCreateStruct.writeUInt32LE(memfd, 0);
    udmabufCreateStruct.writeUInt32LE(flags, 4);
    udmabufCreateStruct.writeBigUInt64LE(offset, 8);
    udmabufCreateStruct.writeBigUInt64LE(BigInt(size), 16);

    const { errno: ioctlErrno, ret } = kernelInterface.ioctl({ fd: udmabufFd, request: UDMABUF_CREATE, arg: udmabufCreateStruct });
    if (ioctlErrno !== undefined) {
      return {
        errno: ioctlErrno,
        dmabufFd: undefined
      };
    }

    const dmabufFd = Number(ret);

    return {
      errno: undefined,
      dmabufFd
    };
  };

  const truncateAndSealMemfd = ({ memfd, size }: { memfd: number; size: number }) => {
    const { error: ftruncateError } = kernelInterface.ftruncate({ fd: memfd, length: size });
    if (ftruncateError !== undefined) {
      throw Error("failed to truncate memfd", { cause: ftruncateError });
    }

    const { errno: fcntlErrno } = kernelInterface.fcntl({ fd: memfd, cmd: F_ADD_SEALS, arg: F_SEAL_SHRINK });
    if (fcntlErrno !== undefined) {
      throw Error(`failed to seal memfd, errno: ${fcntlErrno}`);
    }
  };

  const createUdmabufAllocator = ({ udmabufFd }: { udmabufFd: number }): TDmabufAllocator => {

    const pageSize = kernelInterface.determinePageSize();
    const allocationSizeDeterminer = createDefaultAllocationSizeDeterminer({ pageSize });

    const determineOptimalAllocationSize: TDmabufHeap["determineOptimalAllocationSize"] = ({ minimumSize }) => {
      return allocationSizeDeterminer.determineOptimalAllocationSize({ minimumSize });
    };


    // eslint-disable-next-line complexity
    const allocate: TDmabufAllocator["allocate"] = ({ size }) => {

      if (size <= 0) {
        throw Error("size must be > 0");
      }

      if ((size % pageSize) !== 0) {
        throw Error(`size must be a multiple of ${pageSize}`);
      }

      const { errno: memfdCreateErrno, memfd } = kernelInterface.memfd_create({ name: "dmabuf_alloc", flags: MFD_ALLOW_SEALING });
      if (memfdCreateErrno !== undefined) {
        return {
          error: Error(`failed to create memfd, errno: ${memfdCreateErrno}`),
          dmabufFd: undefined
        };
      }

      try {
        truncateAndSealMemfd({ memfd, size });

        const { errno: createUdmabufErrno, dmabufFd } = udmabufCreate({ udmabufFd, memfd, size });

        if (createUdmabufErrno !== undefined) {
          return {
            error: Error(`failed to create udmabuf, errno: ${createUdmabufErrno}`),
            dmabufFd: undefined
          };
        }

        return {
          error: undefined,
          dmabufFd
        };
      } finally {
        kernelInterface.close({ fd: memfd });
      }
    };

    return {
      allocate,
      pageSize,
      determineOptimalAllocationSize
    };
  };

  return {
    createUdmabufAllocator
  };
};

export {
  createUdmabufAllocatorFactory
};
