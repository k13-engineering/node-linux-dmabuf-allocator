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
    const { errno, ret } = nativeIoctl({ fd, request, arg });
    if (errno !== undefined) {
      return { errno, ret: undefined };
    }

    return { errno, ret };
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

  const fcntl: C["fcntl"] = ({ fd, cmd, arg }: { fd: number; cmd: number; arg: number }) => {
    const { errno } = syscall({
      syscallNumber: syscallNumbers.fcntl,
      args: [BigInt(fd), BigInt(cmd), BigInt(arg)]
    });

    if (errno !== undefined) {
      return { errno };
    }

    return { errno: undefined };
  };

  const textEncoder = new TextEncoder();

  const memfd_create: C["memfd_create"] = ({ name, flags }: { name: string; flags: number }) => {

    const nameAsBuffer = textEncoder.encode(`${name} \0`);

    const { errno, ret } = syscall({
      syscallNumber: syscallNumbers.memfd_create,
      args: [
        nameAsBuffer,
        BigInt(flags)
      ]
    });

    if (errno !== undefined) {
      return {
        errno,
        memfd: undefined
      };
    }

    return { errno: undefined, memfd: Number(ret) };
  };

  const ftruncate: C["ftruncate"] = ({ fd, length }: { fd: number; length: number }) => {
    try {
      nodeFs.ftruncateSync(fd, length);
    } catch (e) {
      return {
        error: e as Error,
      };
    }

    return { error: undefined };
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
    fcntl,
    memfd_create,
    ftruncate,
    close
  };
};

export {
  createDefaultDmabufHeapAllocatorLinuxInterface
};
