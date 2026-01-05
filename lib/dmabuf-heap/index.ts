import { createDmabufHeapManager, findDefaultDmabufHeapDevFolder, type TDmabufHeapManager } from "./dmabuf-heap-manager.ts";
import { createDefaultDmabufHeapAllocatorLinuxInterface } from "../kernel-interface-impl-linux.ts";

const createDefaultDmabufHeapManager = (): TDmabufHeapManager => {
  const dmabufHeapDevFolder = findDefaultDmabufHeapDevFolder();
  const kernelInterface = createDefaultDmabufHeapAllocatorLinuxInterface();


  const dmabufHeapManager = createDmabufHeapManager({
    dmabufHeapDevFolder,
    kernelInterface
  });

  return dmabufHeapManager;
};

export {
  createDefaultDmabufHeapManager,
};
