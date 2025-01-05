// commands.ts
import {
  spawn,
  SpawnOptions,
  spawnSync,
  SpawnSyncOptions,
  execSync,
} from "child_process";
import * as path from "path";
import * as fs from "fs";
import { getBinaryPath, Spinner } from "./utils";
import * as https from "https";
import inquirer from "inquirer";

export async function downloadFile(
  url: string,
  destination: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    https
      .get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirects
          return downloadFile(response.headers.location!, destination)
            .then(resolve)
            .catch(reject);
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(destination, () => {});
        reject(err);
      });
  });
}

export async function findPythonPath(): Promise<string | null> {
  if (process.platform === "win32") {
    // First try py.exe directly
    try {
      const pyPath = path.join(process.env.WINDIR || "C:\\Windows", "py.exe");
      if (fs.existsSync(pyPath)) {
        const testResult = spawnSync(pyPath, ["--version"]);
        if (testResult.status === 0) {
          return pyPath;
        }
      }
    } catch {}

    // Then try where.exe to find Python
    try {
      const whereResult = spawnSync("where", ["python"]);
      if (whereResult.status === 0) {
        const pythonPath = whereResult.stdout.toString().split("\n")[0].trim();
        if (fs.existsSync(pythonPath)) {
          const testResult = spawnSync(pythonPath, ["--version"]);
          if (testResult.status === 0) {
            return pythonPath;
          }
        }
      }
    } catch {}
  } else {
    // Unix systems
    for (const cmd of ["python3", "python"]) {
      try {
        const whichResult = spawnSync("which", [cmd]);
        if (whichResult.status === 0) {
          const pythonPath = whichResult.stdout.toString().trim();
          return pythonPath;
        }
      } catch {}
    }
  }

  // Check common installation paths
  const commonPaths =
    process.platform === "win32"
      ? [
          path.join(
            process.env.LOCALAPPDATA || "",
            "Programs",
            "Python",
            "Python312",
            "python.exe"
          ),
          path.join(
            process.env.LOCALAPPDATA || "",
            "Programs",
            "Python",
            "Python311",
            "python.exe"
          ),
          path.join(process.env.ProgramFiles || "", "Python312", "python.exe"),
          path.join(process.env.ProgramFiles || "", "Python311", "python.exe"),
          path.join(
            process.env["ProgramFiles(x86)"] || "",
            "Python312",
            "python.exe"
          ),
          path.join(
            process.env["ProgramFiles(x86)"] || "",
            "Python311",
            "python.exe"
          ),
        ]
      : ["/usr/bin/python3", "/usr/local/bin/python3", "/usr/bin/python"];

  for (const pythonPath of commonPaths) {
    if (fs.existsSync(pythonPath)) {
      const testResult = spawnSync(pythonPath, ["--version"]);
      if (testResult.status === 0) {
        return pythonPath;
      }
    }
  }

  return null;
}

async function findGitPath(): Promise<string | null> {
  // Try common git installation paths on Windows
  const commonPaths =
    process.platform === "win32"
      ? [
          path.join(process.env.ProgramFiles || "", "Git", "cmd", "git.exe"),
          path.join(
            process.env["ProgramFiles(x86)"] || "",
            "Git",
            "cmd",
            "git.exe"
          ),
          path.join(
            process.env.LOCALAPPDATA || "",
            "Programs",
            "Git",
            "cmd",
            "git.exe"
          ),
          // Add GitHub Desktop's Git path
          path.join(
            process.env.LOCALAPPDATA || "",
            "GitHub",
            "PortableGit_",
            "cmd",
            "git.exe"
          ),
        ]
      : ["/usr/bin/git", "/usr/local/bin/git"];

  for (const gitPath of commonPaths) {
    if (fs.existsSync(gitPath)) {
      // Return the path wrapped in quotes if it contains spaces
      return gitPath.includes(" ") ? `"${gitPath}"` : gitPath;
    }
  }

  // For GitHub Desktop's Git on Windows, search with wildcard
  if (process.platform === "win32") {
    const githubPath = path.join(process.env.LOCALAPPDATA || "", "GitHub");
    if (fs.existsSync(githubPath)) {
      const dirs = fs.readdirSync(githubPath);
      for (const dir of dirs) {
        if (dir.startsWith("PortableGit_")) {
          const gitPath = path.join(githubPath, dir, "cmd", "git.exe");
          if (fs.existsSync(gitPath)) {
            return gitPath;
          }
        }
      }
    }
  }

  return null;
}

export async function executeCommand(
  command: string,
  args: string[],
  options: SpawnSyncOptions = {},
  progressIndicator: Spinner | null = null
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

    const pythonPaths = [
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Python"),
      path.join(process.env.ProgramFiles || "", "Python"),
      path.join(process.env["ProgramFiles(x86)"] || "", "Python"),
    ];

    // Add Git paths
    gitPaths.forEach((gitPath) => {
      if (
        systemPath &&
        !systemPath.includes(gitPath) &&
        fs.existsSync(gitPath)
      ) {
        systemPath += `;${gitPath}`;
      }
    });

    // Add Python paths - look for Python installations (e.g., Python39, Python310, etc.)
    pythonPaths.forEach((basePath) => {
      if (fs.existsSync(basePath)) {
        fs.readdirSync(basePath).forEach((dir) => {
          if (dir.startsWith("Python")) {
            const pythonPath = path.join(basePath, dir);
            const pythonScriptsPath = path.join(pythonPath, "Scripts");
            if (systemPath && !systemPath.includes(pythonPath)) {
              systemPath += `;${pythonPath}`;
              if (fs.existsSync(pythonScriptsPath)) {
                systemPath += `;${pythonScriptsPath}`;
              }
            }
          }
        });
      }
    });
  }

  // Update the PATH in the options
  options.env = {
    ...process.env,
    PATH: systemPath,
  };

  // Special handling for git commands
  if (command === "git") {
    const gitPath = await findGitPath();
    if (gitPath) {
      // Use the quoted path if needed
      command = gitPath;
      // Set shell to true for Windows to handle quoted paths
      options.shell = process.platform === "win32";
    } else {
      throw new Error(
        "Git is not installed or not found in common locations. Please install Git and try again."
      );
    }
  }

  // Handle errors more gracefully
  try {
    const result = spawnSync(command, args, {
      ...options,
      shell: process.platform === "win32",
      windowsVerbatimArguments: process.platform === "win32",
    });

    // Add debug logging
    if (result.error || result.status !== 0) {
      console.error("Command:", command);
      console.error("Args:", args);
      console.error("Exit code:", result.status);
      console.error("stderr:", result.stderr?.toString());
      console.error("stdout:", result.stdout?.toString());
    }

    if (result.error) {
      throw new Error(`Command execution error: ${result.error.message}`);
    }
    if (result.status !== 0) {
      const errorOutput =
        result.stderr?.toString() ||
        result.stdout?.toString() ||
        "Unknown error";
      throw new Error(`Command failed: ${errorOutput.trim()}`);
    }

    return result;
  } catch (error: any) {
    // Add more context to the error
    throw new Error(`Failed to execute ${command}: ${error.message}`);
  }
}
