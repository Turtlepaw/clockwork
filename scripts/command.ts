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

async function findPythonPath(): Promise<string | null> {
  // Try common commands first
  const commands =
    process.platform === "win32"
      ? ["python.exe", "python3.exe"]
      : ["python3", "python"];

  for (const cmd of commands) {
    try {
      const result = spawnSync(cmd, ["--version"]);
      if (result.status === 0) {
        // Get the full path
        const pathResult = spawnSync(
          process.platform === "win32" ? "where" : "which",
          [cmd]
        );
        if (pathResult.status === 0) {
          // Clean up the path - remove any carriage returns or whitespace
          return pathResult.stdout
            .toString()
            .trim()
            .split("\n")[0]
            .trim()
            .replace(/\r$/, "");
        }
      }
    } catch {}
  }

  // Check common installation paths
  const commonPaths =
    process.platform === "win32"
      ? [
          process.env.LOCALAPPDATA,
          process.env.ProgramFiles,
          process.env["ProgramFiles(x86)"],
        ]
          .filter(Boolean)
          .flatMap((base) => [
            path.join(base!, "Python*", "python.exe"),
            path.join(base!, "Programs", "Python*", "python.exe"),
          ])
      : ["/usr/bin/python3", "/usr/local/bin/python3", "/usr/bin/python"];

  for (const pythonPath of commonPaths) {
    if (pythonPath.includes("*")) {
      // Handle glob patterns on Windows
      const searchDir = path.dirname(pythonPath);
      if (fs.existsSync(searchDir)) {
        const dirs = fs.readdirSync(searchDir);
        for (const dir of dirs) {
          if (dir.startsWith("Python")) {
            const fullPath = path.join(searchDir, dir, "python.exe");
            if (fs.existsSync(fullPath)) {
              return fullPath;
            }
          }
        }
      }
    } else if (fs.existsSync(pythonPath)) {
      return pythonPath;
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

  // Check if git is available in the updated PATH
  const gitCheck = spawnSync("git", ["--version"], { env: options.env });
  if (gitCheck.error) {
    throw new Error(
      "Git is not installed or not available in PATH. Please install Git and try again."
    );
  }

  // Check if the command is python and verify it's available
  if (command === "python") {
    progressIndicator?.pause();

    const pythonPath = await findPythonPath();
    if (pythonPath) {
      // Clean the path and verify it exists
      const cleanPath = pythonPath.trim().replace(/\r$/, "");
      if (fs.existsSync(cleanPath)) {
        command = cleanPath;
      } else {
        // Fall back to embedded Python if system Python can't be found
        command = await getEmbeddedPython(progressIndicator);
      }
    } else {
      command = await getEmbeddedPython(progressIndicator);
    }

    progressIndicator?.resume();
  }

  // Execute the command with shell: true on Windows to help resolve paths
  const result = spawnSync(command, args, {
    ...options,
    shell: process.platform === "win32",
    windowsVerbatimArguments: true,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Command failed: ${command} ${args.join(" ")}\n${
        result.stderr?.toString() || ""
      }`
    );
  }

  return result;
}

async function getEmbeddedPython(
  progressIndicator: Spinner | null
): Promise<string> {
  const pythonDir = path.join(await getBinaryPath(), "tools", "python");
  const pythonExe = path.join(pythonDir, "python.exe");

  if (!fs.existsSync(pythonExe)) {
    // Inquire
    const { downloadPython } = await inquirer.prompt([
      {
        type: "confirm",
        name: "downloadPython",
        message:
          "Python not found. Do you want to download the embedded Python?",
        default: true,
      },
    ]);

    progressIndicator?.resume();

    if (downloadPython) {
      progressIndicator?.updateMessage("Downloading embedded Python...");
      const pythonVersion = "3.11.6";
      const pythonUrl = `https://www.python.org/ftp/python/${pythonVersion}/python-${pythonVersion}-embed-amd64.zip`;

      fs.mkdirSync(pythonDir, { recursive: true });

      // Download and extract Python using Node.js https
      const downloadPath = path.join(pythonDir, "python.zip");
      await downloadFile(pythonUrl, downloadPath);
      execSync(`tar -xf "${downloadPath}" -C "${pythonDir}"`);
      fs.unlinkSync(downloadPath);
    } else {
      throw new Error("Python not found. Aborting...");
    }
  }

  return pythonExe;
}
