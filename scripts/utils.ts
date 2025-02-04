import chalk from "chalk";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import inquirer from "inquirer";
import https from "https";
import sudo from "@vscode/sudo-prompt";
import { platform } from "os";
import { PACKAGE_JSON_NAME } from "./constants";
import { findPythonPath } from "./command";

// GitHub API URL for the latest release
const repoOwner = "Turtlepaw";
const repoName = "clockwork";
const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`;

export interface Spinner {
  stop: (isSuccess?: boolean) => void;
  updateMessage: (message: string) => void;
  pause: () => void;
  resume: () => void;
}

// Custom spinner function
export async function progressIndicator(taskName: string): Promise<Spinner> {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frameIndex = 0;
  let intervalId: NodeJS.Timeout;
  let isPaused = false;

  // Function to animate the spinner
  const animate = () => {
    if (!isPaused) {
      process.stdout.write(`\r${chalk.cyan(frames[frameIndex])} ${taskName}`); // Overwrite the line with each frame
      frameIndex = (frameIndex + 1) % frames.length; // Cycle through frames
    }
  };

  // Start the spinner
  intervalId = setInterval(animate, 80);

  // Stop method
  function stop(isSuccess = true) {
    isPaused = true;
    clearInterval(intervalId); // Stop the spinner
    process.stdout.write(
      `\r${isSuccess ? chalk.green("✓") : chalk.red("✘")} ${taskName}\n`
    );
  }

  // Function to update the message
  function updateMessage(message: string) {
    clearInterval(intervalId);
    taskName = message;
    intervalId = setInterval(animate, 80);
  }

  // Function to pause the spinner
  function pause() {
    isPaused = true;
    process.stdout.write(`\r`);
  }

  // Function to resume the spinner
  function resume() {
    isPaused = false;
    intervalId = setInterval(animate, 80);
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Return control methods for external usage
  return { stop, updateMessage, pause, resume };
}

export async function verifyInstallationPath() {
  try {
    await getBinaryPath();
  } catch (error: any) {
    console.log(error);
    console.error(chalk.red("Failed to resolve the installation path"));
    console.log(
      chalk.yellow(
        "• Verify that the CLOCKWORK_HOME environment variable is set and available."
      )
    );
    process.exit(1);
  }
}

/**
 * Determine the full path of the current binary.
 * Uses the CLOCKWORK_HOME environment variable if set.
 * Otherwise, defaults to:
 * Linux and MacOS - "/usr/local/bin/clockwork"
 * Windows - "C:\\Users\\user\\Clockwork"
 */
export async function getBinaryPath() {
  const platform = process.platform;
  let binaryPath = process.env.CLOCKWORK_HOME;

  // Fail by default
  if (!binaryPath) {
    throw new Error("CLOCKWORK_HOME environment variable not set.");
  }

  if (!binaryPath) {
    if (platform === "win32") {
      const userHome = process.env.USERPROFILE || "C:\\Users\\user";
      binaryPath = path.join(userHome, "Clockwork");
    } else {
      binaryPath = path.join("/", "usr", "local", "bin");
    }
  }

  return binaryPath;
}

/**
 * Cleanup old tmp download files in buildDownloadsDirectory.
 */
async function cleanup(buildDownloadsDirectory: string) {
  if (!fs.existsSync(buildDownloadsDirectory)) return;
  const tmpFiles = fs
    .readdirSync(buildDownloadsDirectory)
    .filter((f) => f.endsWith(".tmp"));
  if (tmpFiles.length > 0) {
    const spinner = await progressIndicator("Cleaning downloaded files...");
    tmpFiles.forEach((f) =>
      fs.unlinkSync(path.join(buildDownloadsDirectory, f))
    );
    spinner.stop(true);
  }
}

/**
 * Fetch the latest release info from the GitHub API.
 */
async function fetchLatestRelease() {
  try {
    const response = await fetch(apiUrl, {
      headers: { "User-Agent": "Node.js" }, // Required by GitHub API
    });

    if (!response.ok) {
      if (
        response.status === 403 &&
        response.headers.get("X-RateLimit-Remaining") === "0"
      ) {
        console.error(
          "GitHub API rate limit exceeded. Please try again later."
        );
      } else {
        console.error("Failed to fetch release info:", response.statusText);
      }
      return;
    }

    const release = await response.json();
    return {
      version: release.tag_name,
      data: release,
    };
  } catch (error: any) {
    console.error("Error fetching release info:", error.message);
  }
}

/**
 * Downloads a file using Node.js https module.
 * @param url - The URL to download the file from.
 * @param outputPath - The path to save the downloaded file.
 */
async function downloadFile(
  url: string,
  outputPath: string,
  debugMode: boolean
): Promise<void> {
  if (debugMode) console.log(chalk.cyan(`Downloading file from: ${url}`));
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);

    https
      .get(url, (response) => {
        if (response.statusCode === 302 && response.headers.location) {
          // Follow redirect
          downloadFile(response.headers.location, outputPath, debugMode)
            .then(resolve)
            .catch(reject);
          return;
        } else if (response.statusCode !== 200) {
          reject(
            new Error(
              `Failed to download file: HTTP Status ${response.statusCode}`
            )
          );
          return;
        }

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          if (debugMode)
            console.log(chalk.green(`File downloaded to: ${outputPath}`));
          resolve();
        });

        file.on("error", (err) => {
          fs.unlink(outputPath, () => reject(err)); // Delete incomplete file
        });
      })
      .on("error", (err) => {
        fs.unlink(outputPath, () => reject(err)); // Delete incomplete file
      });
  });
}

async function requestElevatedPermissions() {
  const scriptPath = process.argv[1];
  const args = process.argv.slice(2).join(" ");
  const options = {
    name: "Clockwork Updater",
  };

  return await new Promise((resolve, reject) => {
    sudo.exec(`node ${scriptPath} ${args}`, options, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Download a file using curl (cross-platform).
 * @param url - The URL to download the file from.
 * @param outputPath - The path to save the downloaded file.
 */
async function downloadLatestRelease(
  url: string,
  outputPath: string,
  debugMode: boolean
) {
  try {
    await downloadFile(url, outputPath, debugMode);
    if (debugMode) console.log(chalk.green("Download completed successfully."));
  } catch (error: any) {
    console.error(
      chalk.red("Failed to download the latest release:"),
      error.message
    );
    throw error;
  }
}

/**
 * Replace the current binary with the downloaded one.
 * @param oldPath - The path to the temporary backup of the current binary.
 * @param downloadPath - The path to the downloaded file.
 * @param _binaryPath - The directory containing the binary.
 */
function replaceBinary(
  oldPath: string,
  downloadPath: string,
  _binaryPath: string,
  debugMode: boolean
) {
  const platform = process.platform;
  const binaryPath = path.join(
    _binaryPath,
    `clockwork${platform === "win32" ? ".exe" : ""}`
  );

  try {
    // Ensure the old binary is moved to a temporary location
    if (fs.existsSync(binaryPath)) {
      fs.renameSync(binaryPath, oldPath); // Move the current binary to a temp location
    }

    // Move the downloaded binary to replace the old binary
    fs.renameSync(downloadPath, binaryPath);

    // Ensure the new binary is executable
    fs.chmodSync(binaryPath, 0o755);

    if (debugMode) {
      console.log(chalk.green("Binary replaced successfully."));
      console.log(
        chalk.yellow(
          `The old binary has been moved to ${oldPath}. Cleanup will happen on the next run.`
        )
      );
    }
  } catch (error: any) {
    console.error(
      chalk.red("Failed to replace the binary. Rolling back changes...")
    );

    // Rollback: Try to restore the original binary if something went wrong
    try {
      if (fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, binaryPath);
      }
    } catch (rollbackError: any) {
      console.error(
        chalk.red("Rollback failed. Manual intervention may be required:"),
        rollbackError.message
      );
    }

    console.error(chalk.red("Error details:"), error.message);
  }
}

export async function updater(debugMode: boolean, VERSION: string) {
  const binaryPath = await getBinaryPath();
  const _buildDownloadDirectory = ".wff-build-script/downloads";
  const buildDownloadsDirectory = path.resolve(
    path.join(binaryPath, _buildDownloadDirectory)
  );

  try {
    await cleanup(buildDownloadsDirectory);
  } catch (error: any) {
    console.error(chalk.red("Failed to cleanup old files:"), error.message);
  }

  const updateSpinner = await progressIndicator("Checking for updates...");
  try {
    const latestVersion = await fetchLatestRelease();
    if (latestVersion && latestVersion.version !== VERSION) {
      updateSpinner.stop(true);
      const answer = await inquirer.prompt([
        {
          type: "confirm",
          name: "download-update",
          message: `A newer version (${latestVersion.version}) is available. Download the latest release?`,
          default: false,
        },
      ]);

      if (answer["download-update"]) {
        //await requestElevatedPermissions();
        const platform = process.platform;
        const asset = latestVersion.data.assets.find((a: any) => {
          if (platform === "win32" && a.name.includes("clockwork-win"))
            return true;
          if (platform === "linux" && a.name.includes("clockwork-linux"))
            return true;
          if (platform === "darwin" && a.name.includes("clockwork-macos"))
            return true;
          return false;
        });

        if (!asset) {
          updateSpinner.updateMessage(
            "No compatible asset found for the current platform."
          );
          updateSpinner.stop(false);
          return;
        }

        const downloadUrl = asset.browser_download_url;
        const outputPath = path.resolve(
          buildDownloadsDirectory,
          `${asset.name}`
        );

        const oldPath = path.resolve(
          buildDownloadsDirectory,
          `${asset.name}.old.tmp`
        );

        if (!fs.existsSync(buildDownloadsDirectory)) {
          fs.mkdirSync(buildDownloadsDirectory, { recursive: true });
        }

        await downloadLatestRelease(downloadUrl, outputPath, debugMode);
        await replaceBinary(oldPath, outputPath, binaryPath, debugMode);
        updateSpinner.updateMessage("Update completed successfully.");
        updateSpinner.stop(true);
        process.exit(0);
      }
    } else {
      updateSpinner.updateMessage("No updates available.");
      updateSpinner.stop(true);
    }
  } catch (error: any) {
    updateSpinner.stop(false);
    console.error(
      chalk.red("Failed to check for updates."),
      error.message,
      error
    );
  }
}

export async function getEmbeddedPython(
  progressIndicator: Spinner | null,
  debugMode: boolean
): Promise<string> {
  // First check for system Python
  const systemPython = await findPythonPath();
  if (systemPython) {
    if (debugMode) {
      console.log(chalk.green("Using system Python:", systemPython));
    }
    return systemPython;
  }

  // Fall back to embedded Python if system Python not found
  const pythonDir = path.join(await getBinaryPath(), "tools", "python");
  const pythonExe = path.join(pythonDir, "python.exe");

  if (!fs.existsSync(pythonExe)) {
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
      await downloadFile(pythonUrl, downloadPath, debugMode);
      execSync(`tar -xf "${downloadPath}" -C "${pythonDir}"`);
      fs.unlinkSync(downloadPath);
    } else {
      throw new Error("Python not found. Aborting...");
    }
  }

  return pythonExe;
}

export function initMessage(version: string) {
  console.log(
    chalk.cyan(
      "Clockwork CLI - the open-source package manager for Watch Face Format - v" +
        version
    )
  );
}

export const errors = {
  notInitialized: () => {
    console.log(chalk.red(`No ${PACKAGE_JSON_NAME} found.`));
    console.log(
      `If ${chalk.magentaBright(
        "this directory"
      )} is a Watch Face Format project, run ${chalk.green(
        "clockwork init"
      )} to create a ${PACKAGE_JSON_NAME} file.`
    );
    return;
  },
};

export function validateClockworkPackage() {
  const packageJsonPath = path.join(process.cwd(), PACKAGE_JSON_NAME);
  if (!fs.existsSync(packageJsonPath)) {
    errors.notInitialized();
    process.exit(1);
  }
}
