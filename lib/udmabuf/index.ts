import { openCharacterDeviceBySysfsDevPath } from "linux-devnode";
import { type TDmabufAllocator } from "../dmabuf-allocator-interface.ts";
import { createDefaultDmabufHeapAllocatorLinuxInterface } from "../kernel-interface-impl-linux.ts";
import { createUdmabufAllocatorFactory } from "./udmabuf-allocator.ts";

const O_RDWR = 0x02;
const O_CLOEXEC = 0x80000;

const createDefaultUdmabufAllocator = (): TDmabufAllocator => {
  const kernelInterface = createDefaultDmabufHeapAllocatorLinuxInterface();

  const { error: openError, fd: udmabufFd } = openCharacterDeviceBySysfsDevPath({
    sysfsDevPath: "/sys/class/misc/udmabuf/dev",
    flags: BigInt(O_RDWR | O_CLOEXEC)
  });

  if (openError !== undefined) {
    throw Error("Failed to open udmabuf device. Is the udmabuf kernel module loaded?", { cause: openError });
  }

  const udmabufAllocatorFactory = createUdmabufAllocatorFactory({ kernelInterface });
  return udmabufAllocatorFactory.createUdmabufAllocator({ udmabufFd });
};

export {
  createDefaultUdmabufAllocator,
};
