import chalk from "chalk";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import inquirer from "inquirer";
import https from "https";
import sudo from "@vscode/sudo-prompt";

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
 * Windows - "C:\Program Files\Clockwork\clockwork.exe"
 */
function getBinaryPath() {
  const platform = process.platform;
  let binaryPath = "";

  if (platform === "win32") {
    binaryPath = path.join("C:", "Program Files", "Clockwork");
  } else {
    binaryPath = path.join("/", "usr", "local", "bin");
  }

  return binaryPath;
}

// export async function updater(debugMode: boolean, VERSION: string) {
//   const binaryPath = getBinaryPath();
//   const _buildDownloadDirectory = ".wff-build-script/downloads";
//   const buildDownloadsDirectory = path.resolve(
//     path.join(binaryPath, _buildDownloadDirectory)
//   );
//   const pkgName = "clockwork";

//   /**
//    * Safely replace a binary file (cross-platform).
//    * @param currentPath - Path to the current binary.
//    * @param tempPath - Temporary path for the new binary.
//    */
//   async function replaceBinary(currentPath: string, tempPath: string) {
//     try {
//       // Check if the current binary exists
//       if (fs.existsSync(currentPath)) {
//         const backupPath = `${currentPath}.bak`;

//         // Rename the current file to .bak (as a backup)
//         if (debugMode)
//           console.log(
//             chalk.yellow(`Renaming current binary to: ${backupPath}`)
//           );
//         fs.renameSync(currentPath, backupPath);

//         // Move the new binary to the target path
//         if (debugMode)
//           console.log(
//             chalk.yellow(`Replacing with new binary: ${currentPath}`)
//           );
//         fs.renameSync(tempPath, currentPath);

//         if (debugMode)
//           console.log(chalk.green("Binary replaced successfully!"));
//       } else {
//         // If the binary doesn't exist, just move the new binary
//         if (debugMode)
//           console.log(
//             chalk.yellow(`No existing binary found. Adding new binary.`)
//           );
//         fs.renameSync(tempPath, currentPath);
//       }
//     } catch (error: any) {
//       console.error(chalk.red("Failed to replace binary:"), error.message);
//       throw error;
//     }
//   }

//   /**
//    * Download a file using curl (cross-platform).
//    * @param url - The URL to download the file from.
//    * @param outputPath - The path to save the downloaded file.
//    */
//   function downloadFile(url: string, outputPath: string) {
//     try {
//       if (debugMode) console.log(chalk.cyan(`Downloading file from: ${url}`));
//       execSync(`curl -L --create-dirs -o "${outputPath}" "${url}"`, {
//         stdio: "inherit",
//       });
//       if (debugMode)
//         console.log(chalk.green(`File downloaded to: ${outputPath}`));
//     } catch (error: any) {
//       console.error(chalk.red("Failed to download file:"), error.message);
//       throw error;
//     }
//   }

//   async function fetchLatestReleaseWithCurl(release: any) {
//     const updateSpinner = await progressIndicator(
//       "Determining latest release asset..."
//     );
//     try {
//       if (release.assets && release.assets.length > 0) {
//         const platform = process.platform;
//         const asset = release.assets.find((a: any) => {
//           if (platform === "win32" && a.name.includes(`${pkgName}-win`))
//             return true;
//           if (platform === "linux" && a.name.includes(`${pkgName}-linux`))
//             return true;
//           if (platform === "darwin" && a.name.includes(`${pkgName}-macos`))
//             return true;
//           return false;
//         });

//         if (!asset) {
//           updateSpinner.updateMessage(
//             "No compatible asset found for the current platform."
//           );
//           return;
//         }

//         const downloadUrl = asset.browser_download_url;
//         const outputPath = binaryPath;

//         if (!fs.existsSync(buildDownloadsDirectory)) {
//           fs.mkdirSync(buildDownloadsDirectory, { recursive: true });
//         }

//         // Add temporary path to .gitignore
//         const gitignorePath = path.resolve(".", ".gitignore");

//         updateSpinner.updateMessage("Adding files to git ignore...");
//         const content = `# Temporary download files\n${_buildDownloadDirectory}\n`;
//         if (!fs.existsSync(gitignorePath)) {
//           fs.writeFileSync(gitignorePath, content);
//         } else {
//           const gitignoreContent = fs.readFileSync(gitignorePath, "utf8");
//           if (!gitignoreContent.includes(_buildDownloadDirectory)) {
//             fs.appendFileSync(gitignorePath, `\n${content}`);
//           }
//         }

//         updateSpinner.updateMessage("Downloading latest release...");
//         const tempPath = path.resolve(
//           buildDownloadsDirectory,
//           `${asset.name}.tmp`
//         ); // Temporary file path

//         downloadFile(downloadUrl, tempPath);
//         replaceBinary(outputPath, tempPath);
//         console.log(
//           chalk.green(`Replaced ${outputPath} with the latest version.`)
//         );
//       } else {
//         console.error(chalk.red("No assets found in the latest release."));
//       }
//     } catch (error: any) {
//       console.error("Error fetching or downloading release:", error.message);
//     } finally {
//       updateSpinner.stop(true);
//     }
//   }

//   // Check if newer version is available
//   const updateSpinner = await progressIndicator("Checking for updates...");
//   try {
//     const latestVersion = await fetchLatestRelease();
//     if (latestVersion && latestVersion.version !== VERSION) {
//       updateSpinner.stop(true);
//       // Ask user if they want to download the latest release
//       const answer = await inquirer.prompt([
//         {
//           type: "confirm",
//           name: "download-update",
//           message: `A newer version (${latestVersion.version}) is available. Download the latest release?`,
//           default: false,
//         },
//       ]);

//       if (answer["download-update"]) {
//         await fetchLatestReleaseWithCurl(latestVersion.data);
//         console.log("Update complete.");
//         process.exit(0);
//       }
//     } else {
//       updateSpinner.updateMessage("No updates available.");
//       updateSpinner.stop(true);
//     }
//   } catch {
//     updateSpinner.stop(false);
//     console.error("Failed to check for updates.");
//   }
// }

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
    tmpFiles.forEach((f) => fs.unlinkSync(f));
    spinner.stop(true);
  }
}

/**
 * Fetch the latest release info from the GitHub API.
 */
async function fetchLatestRelease() {
  const response = await fetch(apiUrl, {
    headers: { "User-Agent": "Node.js" }, // Required by GitHub API
  });

  if (!response.ok) {
    console.error("Failed to fetch release info:", response.statusText);
    return;
  }

  const release = await response.json();
  return {
    version: release.tag_name,
    data: release,
  };
}

/**
 * Downloads a file using Node.js https module.
 * @param url - The URL to download the file from.
 * @param outputPath - The path to save the downloaded file.
 */
async function downloadFile(url: string, outputPath: string): Promise<void> {
  console.log(chalk.cyan(`Downloading file from: ${url}`));
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);

    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
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
async function downloadLatestRelease(url: string, outputPath: string) {
  try {
    await downloadFile(url, outputPath);
    console.log(chalk.green("Download completed successfully."));
  } catch (error: any) {
    console.error(
      chalk.red("Failed to download the latest release:"),
      error.message
    );
    throw error;
  }
}

export async function updater(debugMode: boolean, VERSION: string) {
  const binaryPath = getBinaryPath();
  const _buildDownloadDirectory = ".wff-build-script/downloads";
  const buildDownloadsDirectory = path.resolve(
    path.join(binaryPath, _buildDownloadDirectory)
  );
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
        await requestElevatedPermissions();
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
          console.error(
            chalk.red("No compatible asset found for the current platform.")
          );
          return;
        }

        const downloadUrl = asset.browser_download_url;
        const outputPath = path.resolve(
          buildDownloadsDirectory,
          `${asset.name}.tmp`
        );

        await downloadLatestRelease(downloadUrl, outputPath);
        console.log(chalk.green("Update complete."));
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
