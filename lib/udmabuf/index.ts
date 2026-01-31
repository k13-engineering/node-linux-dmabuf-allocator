import { type TDmabufAllocator } from "../dmabuf-allocator-interface.ts";
import { createDefaultDmabufHeapAllocatorLinuxInterface } from "../kernel-interface-impl-linux.ts";
import { createUdmabufAllocatorFactory } from "./udmabuf-allocator.ts";

const O_RDWR = 0x02;
const O_CLOEXEC = 0x80000;

const createDefaultUdmabufAllocator = (): TDmabufAllocator => {
  const kernelInterface = createDefaultDmabufHeapAllocatorLinuxInterface();

  const { errno, fd } = kernelInterface.open({
    path: "/dev/udmabuf",
    flags: O_RDWR | O_CLOEXEC
  });

  if (errno !== undefined) {
    throw Error(`failed to open /dev/udmabuf, errno ${errno}. Is the udmabuf kernel module loaded?`);
  }

  const udmabufAllocatorFactory = createUdmabufAllocatorFactory({ kernelInterface });
  return udmabufAllocatorFactory.createUdmabufAllocator({ udmabufFd: fd });
};

export {
  createDefaultUdmabufAllocator,
};
