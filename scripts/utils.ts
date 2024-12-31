import chalk from "chalk";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import inquirer from "inquirer";
import https from "https";
import sudo from "@vscode/sudo-prompt";
import { platform } from "os";

// GitHub API URL for the latest release
const repoOwner = "Turtlepaw";
const repoName = "clockwork";
const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`;

// Custom spinner function
export async function progressIndicator(taskName: string) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frameIndex = 0;
  let intervalId: NodeJS.Timeout;

  // Function to animate the spinner
  const animate = () => {
    process.stdout.write(`\r${chalk.cyan(frames[frameIndex])} ${taskName}`); // Overwrite the line with each frame
    frameIndex = (frameIndex + 1) % frames.length; // Cycle through frames
  };

  // Start the spinner
  intervalId = setInterval(animate, 80);

  // Stop method
  function stop(isSuccess = true) {
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

  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Return stop method for external usage
  return { stop, updateMessage };
}

/**
 * Determine the full path of the current binary.
 *
 * Linux and MacOS - "/usr/local/bin/clockwork"
 * Windows - "C:\\Users\\user\\Clockwork"
 */
function getBinaryPath() {
  const platform = process.platform;
  let binaryPath = "";

  if (platform === "win32") {
    const userHome = process.env.USERPROFILE || "C:\\Users\\user";
    binaryPath = path.join(userHome, "Clockwork");
  } else {
    binaryPath = path.join("/", "usr", "local", "bin");
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
  const binaryPath = getBinaryPath();
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

export function initMessage(version: string) {
  console.log(
    chalk.cyan(
      "Clockwork CLI - the open-source package manager for Watch Face Format - v" +
        version
    )
  );
}
