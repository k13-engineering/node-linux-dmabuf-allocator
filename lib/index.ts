import { createDefaultDmabufHeapManager } from "./dmabuf-heap/index.ts";
import { createDefaultUdmabufAllocator } from "./udmabuf/index.ts";
import type { TDmabufHeapManager } from "./dmabuf-heap/dmabuf-heap-manager.ts";
import type { TDmabufAllocator } from "./dmabuf-allocator-interface.ts";

export {
  createDefaultDmabufHeapManager,
  createDefaultUdmabufAllocator
};

export type {
  TDmabufHeapManager,
  TDmabufAllocator
};
