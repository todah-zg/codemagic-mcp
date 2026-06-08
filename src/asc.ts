import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function runAsc<T>(args: string[]): Promise<T> {
  try {
    const { stdout } = await execFileAsync("asc", [...args, "--output", "json"]);
    return JSON.parse(stdout) as T;
  } catch (error) {
    throw new Error(`asc ${args[0]} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}


export interface AscAppRaw {
    id: string;
    attributes: {
        name: string;
        bundleId: string;
        sku: string;
    };
}

export interface AscApp {
    id: string;
    name: string;
    bundleId: string;
}

export async function listAscApps(): Promise<AscApp[]> {
    const response = await runAsc<{ data: AscAppRaw[] }>(["apps", "list"]);
    return response.data.map(app => ({
        id: app.id,
        name: app.attributes.name,
        bundleId: app.attributes.bundleId,
    }));
}
