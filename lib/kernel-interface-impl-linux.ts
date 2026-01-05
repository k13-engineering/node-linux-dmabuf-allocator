import type { TDmabufHeapKernelInterface } from "./kernel-interface.ts";
import { ioctl as nativeIoctl } from "@k13engineering/po6-ioctl";
import nodeFs from "node:fs";
import nodeOs from "node:os";
import { syscall, syscallNumbers } from "syscall-napi";

const createDefaultDmabufHeapAllocatorLinuxInterface = (): TDmabufHeapKernelInterface => {

  type C = TDmabufHeapKernelInterface;

  const endianness = nodeOs.endianness();

  const determinePageSize: C["determinePageSize"] = () => {
    // TODO: get from system
    return 4096;
  };

  const ioctl: C["ioctl"] = ({ fd, request, arg }) => {
    const { errno } = nativeIoctl({ fd, request, arg });
    return { errno };
  };

  const dup = ({ fd }: { fd: number }): number => {
    const { errno, ret: newFd } = syscall({
      syscallNumber: syscallNumbers.dup,
      args: [
        BigInt(fd)
      ]
    });

    if (errno !== undefined) {
      throw Error(`dup failed with errno ${errno}`);
    }

    return Number(newFd);
  };

  const readdir: C["readdir"] = ({ path }) => {
    try {
      const entries = nodeFs.readdirSync(path);
      return { errno: undefined, entries };
    } catch (ex) {
      const err = ex as NodeJS.ErrnoException;
      return { errno: -err.errno!, entries: undefined };
    }
  };

  const open: C["open"] = ({ path, flags }) => {
    try {
      const fd = nodeFs.openSync(path, flags);
      return { errno: undefined, fd };
    } catch (ex) {
      const err = ex as NodeJS.ErrnoException;
      return { errno: -err.errno!, fd: undefined };
    }
  };

  const close: C["close"] = ({ fd }) => {
    nodeFs.closeSync(fd);
  };

  return {
    endianness,
    determinePageSize,
    ioctl,
    dup,
    readdir,
    open,
    close
  };
};

export {
  createDefaultDmabufHeapAllocatorLinuxInterface
};
