// commands.ts
import {
  spawn,
  SpawnOptions,
  spawnSync,
  SpawnSyncOptions,
} from "child_process";
import * as path from "path";
import * as fs from "fs";

export function executeCommand(
  command: string,
  args: string[],
  options: SpawnSyncOptions = {}
) {
  // Ensure we're using the system PATH
  let systemPath = process.env.PATH || process.env.Path || process.env.path;

  // On Windows, add common program paths if they exist
  if (process.platform === "win32") {
    const gitPaths = [
      path.join(process.env.ProgramFiles || "", "Git", "cmd"),
      path.join(process.env["ProgramFiles(x86)"] || "", "Git", "cmd"),
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Git", "cmd"),
    ];

    gitPaths.forEach((gitPath) => {
      if (
        systemPath &&
        !systemPath.includes(gitPath) &&
        fs.existsSync(gitPath)
      ) {
        systemPath += `;${gitPath}`;
      }
    });
  }

  // Update the PATH in the options
  options.env = {
    ...process.env,
    PATH: systemPath,
  };

  // Check if git is available in the updated PATH
  const gitCheck = spawnSync("git", ["--version"], { env: options.env });
  if (gitCheck.error) {
    throw new Error(
      "Git is not installed or not available in PATH. Please install Git and try again."
    );
  }

  // Execute the command
  const result = spawnSync(command, args, options);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }

  return result;
}
