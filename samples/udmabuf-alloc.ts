import { createDefaultUdmabufAllocator } from "../lib/index.ts";

const allocator = createDefaultUdmabufAllocator();
const { error: allocError, dmabufFd } = allocator.allocate({ size: 1024 * 1024 });

if (allocError !== undefined) {
  throw allocError;
}

console.log(`allocated dmabuf with fd ${dmabufFd}`);
