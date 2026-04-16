// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import { MergedOutputs } from "./openscad-worker.ts";
import { AbortablePromise } from "../utils.ts";
import { Source } from "../state/app-state.ts";

export type OpenSCADInvocation = {
  mountArchives: boolean,
  inputs?: Source[],
  args: string[],
  outputPaths?: string[],
}

export type OpenSCADInvocationResults = {
  exitCode?: number,
  error?: string,
  outputs?: [string, string][],
  mergedOutputs: MergedOutputs,
  elapsedMillis: number,
};

export type ProcessStreams = {stderr: string} | {stdout: string}
export type OpenSCADInvocationCallback = {result: OpenSCADInvocationResults} | ProcessStreams;

export function spawnOpenSCAD(
  invocation: OpenSCADInvocation, 
  streamsCallback: (ps: ProcessStreams) => void
): AbortablePromise<OpenSCADInvocationResults> {
  let worker: Worker | null;

  function terminate() {
    if (!worker) {
      return;
    }
    worker.terminate();
    worker = null;
  }
    
  return AbortablePromise<OpenSCADInvocationResults>((resolve: (result: OpenSCADInvocationResults) => void, reject: (error: any) => void) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    worker = new Worker(new URL('./openscad-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<OpenSCADInvocationCallback>) => {
      if ('result' in e.data) {
        settle(() => resolve(e.data.result));
        terminate();
      } else {
        streamsCallback(e.data);
      }
    }
    worker.postMessage(invocation)
    
    return () => {
      terminate();
      settle(() => reject(Object.assign(new Error('OpenSCAD worker terminated before completion'), { name: 'AbortError' })));
    };
  });
}
