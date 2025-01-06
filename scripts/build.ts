// scripts/build-watchface.ts
import { exec, execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import inquirer from "inquirer";
import chalk from "chalk"; // For colored text
import {
  getBinaryPath,
  initMessage,
  progressIndicator,
  updater,
  getEmbeddedPython,
} from "./utils";
import { getPackages, readPackageFile } from "./package";
import { downloadFile, executeCommand } from "./command";

// get version from package.json
const VERSION = "__VERSION__";
const params: Record<string, string[]> = {
  debug: ["-d", "--debug"],
  release: ["-r", "--release"],
  all: ["-a", "--all"],
  nonInteractive: ["--non-interactive"],
};

async function findPreprocessedFile(): Promise<string> {
  const commonFiles = [
    "watchface/watchface-pp.xml",
    "watchface-pp.xml",
    "watchface.xml",
  ];

  const existingFiles = [];
  for (const file of commonFiles) {
    const exists = fs.existsSync(file);
    if (exists) {
      existingFiles.push(file);
    } else continue;
  }

  if (existingFiles.length > 1) {
  } else if (existingFiles.length <= 0) {
    console.error(chalk.red("Failed to find an XML file to preprocess"));
    console.debug(chalk.gray("Clockwork checked these common files:"));
    for (const file of commonFiles) {
      console.debug(chalk.gray(`  • `) + file);
    }
  }

  return existingFiles[0];
}

export default async function main() {
  const env = process.env;
  let watchFaceId = env.WATCHFACE_ID;
  const debugMode = process.argv.some((arg) => params.debug.includes(arg));
  const releaseMode = process.argv.some((arg) => params.release.includes(arg));
  const allDevices = process.argv.some((arg) => params.all.includes(arg));
  const nonInteractive = process.argv.some((arg) =>
    params.nonInteractive.includes(arg)
  );

  if (debugMode) {
    console.log("Debug mode enabled.");
  }

  // Determine watchface ID
  if (!watchFaceId) {
    const buildGradlePath = path.resolve("watchface/build.gradle.kts");
    if (fs.existsSync(buildGradlePath)) {
      const gradleContent = fs.readFileSync(buildGradlePath, "utf8");
      const match = gradleContent.match(/applicationId\s*=\s*"(.*?)"/);
      if (match) {
        watchFaceId = match[1];
      } else {
        console.error(
          "Can't determine watchFaceId: check watchface/build.gradle.kts"
        );
        process.exit(9);
      }
    } else {
      console.error(chalk.red("Can't find build.gradle.kts file."));
      process.exit(9);
    }
  }

  // Set environment variables
  if (!env.JAVA_HOME || !env.ANDROID_HOME) {
    const setEnvPath = path.resolve("..", "wff-build-tools", "set-env.bat");
    if (!fs.existsSync(setEnvPath)) {
      console.error("Error: set-env.bat not found.");
      process.exit(10);
    }
    spawnSync("cmd", ["/c", setEnvPath], { stdio: "inherit" });
  }

  if (!env.JAVA_HOME || !env.ANDROID_HOME) {
    console.error(
      "Environment variables JAVA_HOME or ANDROID_HOME are not set."
    );
    process.exit(7);
  }

  const adbExe = path.join(env.ANDROID_HOME!, "platform-tools", "adb");
  if (debugMode) {
    console.log(`adbExe: ${adbExe}`);
  }

  const packageFile = readPackageFile();
  if (packageFile.watchFaceFormatVersion == null)
    console.log(
      chalk.yellow(
        "Warning: watchFaceFormatVersion not set in package file. Using default version 2."
      )
    );

  const packages = getPackages();
  if (packages.isPackageInstalled("xml-preprocessor")) {
    // Preprocessing
    const preprocessScript = path.resolve(
      packages.getPackagePath("xml-preprocessor"),
      "preprocess.py"
    );
    if (!fs.existsSync(preprocessScript)) {
      console.error(chalk.red("Preprocessor script not found."));
      console.error("You may need to run" + chalk.green(" clockwork install"));
      process.exit(8);
    }

    const spinner = await progressIndicator("Preprocessing...");
    try {
      // Get Python executable path
      const pythonPath = await getEmbeddedPython(spinner, debugMode);
      if (debugMode) {
        console.log("Using Python path:", pythonPath);
      }

      const absolutePreprocessScript = path.resolve(preprocessScript);

      await executeCommand(
        pythonPath,
        [
          absolutePreprocessScript,
          await findPreprocessedFile(),
          "watchface/src/main/res/raw/watchface.xml",
          "-y",
          debugMode ? "-d" : "",
        ].filter(Boolean),
        {
          stdio: "inherit",
          env: {
            ...process.env,
            PYTHONIOENCODING: "utf-8",
            PYTHONLEGACYWINDOWSFSENCODING: "1",
          },
        },
        spinner
      );

      spinner.stop(true);
    } catch (error: any) {
      spinner.stop(false);
      console.error("Preprocessor error; build stopped.");
      console.error(error);
      process.exit(1);
    }
  } else {
    console.error(
      chalk.yellow("Preprocessor not installed, skipping preprocessing.")
    );
  }

  const buildToolsPath = path.resolve(await getBinaryPath(), "build-tools");
  // Validation
  const validatorJar = path.resolve(
    buildToolsPath,
    "dwf-format-2-validator-1.0.jar"
  );

  if (!fs.existsSync(validatorJar) && !nonInteractive) {
    const answer = await inquirer.prompt([
      {
        type: "confirm",
        name: "download-validator",
        message: "Validator not found. Download from latest GitHub release?",
        default: false,
      },
    ]);

    if (answer["download-validator"]) {
      const spinner = await progressIndicator(
        "Downloading validator from https://github.com/google/watchface..."
      );
      try {
        // Create dir if not exists
        if (!fs.existsSync(path.dirname(validatorJar))) {
          fs.mkdirSync(path.dirname(validatorJar), { recursive: true });
        }

        await downloadFile(
          "https://github.com/google/watchface/releases/download/latest/dwf-format-2-validator-1.0.jar",
          validatorJar
        );

        spinner.stop(true);
      } catch {
        spinner.stop(false);
        console.error("Download failed.");
        process.exit(6);
      }
    } else {
      console.error("Validator not downloaded, no watch face validation.");
    }
  }

  if (fs.existsSync(validatorJar)) {
    const spinner = await progressIndicator("Validating...");
    try {
      const result = await executeCommand(`${env.JAVA_HOME}\\bin\\java`, [
        "-jar",
        validatorJar,
        packageFile.watchFaceFormatVersion ?? "2",
        //"2",
        "watchface/src/main/res/raw/watchface.xml",
      ]);
      if (!result.output.toString().includes("PASSED")) {
        spinner.stop(false);
        console.error("Validation failed:");
        console.log(result.output.toString());
        process.exit(3);
      }
      spinner.stop(true);
    } catch (error: any) {
      spinner.stop(false);
      console.error("Validation error.");
      console.error(error);
      process.exit(3);
    }
  } else {
    console.log("Skipping validation: Validator JAR not found.");
  }

  // Build
  console.log("🛠️ Building...");
  const task = releaseMode ? "bundleRelease" : "assembleDebug";
  try {
    await executeCommand("gradlew", [task], {
      stdio: "inherit",
    });
  } catch {
    console.error("Build error!");
    process.exit(2);
  }

  // Run separately to avoid exiting prematurely
  await (async () => {
    if (releaseMode) {
      const memoryTool = path.resolve(buildToolsPath, "memory-footprint.jar");

      if (!fs.existsSync(memoryTool)) {
        if (nonInteractive) {
          return;
        }

        const answer = await inquirer.prompt([
          {
            type: "confirm",
            name: "download-memory-tool",
            message:
              "Memory footprint tool not found. Download from latest GitHub release?",
            default: false,
          },
        ]);

        if (answer["download-memory-tool"]) {
          const spinner = await progressIndicator(
            "Downloading memory footprint tool from https://github.com/google/watchface..."
          );
          try {
            // Create dir if not exists
            if (!fs.existsSync(path.dirname(memoryTool))) {
              fs.mkdirSync(path.dirname(memoryTool), { recursive: true });
            }

            await downloadFile(
              "https://github.com/google/watchface/releases/download/latest/memory-footprint.jar",
              memoryTool
            );
            spinner.stop(true);
          } catch (error: any) {
            spinner.stop(false);
            console.error("Download failed.");
            console.error(error);
            process.exit(6);
          }
        } else {
          console.error("Validator not downloaded, no watch face validation.");
          return;
        }
      }

      const spinner = await progressIndicator("Checking memory footprint...");

      try {
        await executeCommand(`${env.JAVA_HOME}\\bin\\java`, [
          "-jar",
          memoryTool,
          "--watch-face",
          "watchface/build/outputs/bundle/release/watchface-release.aab",
          "--schema-version",
          "2",
          "--ambient-limit-mb",
          "10",
          "--active-limit-mb",
          "100",
          "--apply-v1-offload-limitations",
          "--estimate-optimization",
          "--report",
          "--verbose",
        ]);
        spinner.stop(true);
      } catch {
        spinner.stop(false);
        console.error("Memory footprint check failed.");
      }
      return;
    }
  })();

  if (releaseMode) {
    console.log(
      chalk.yellow("Release builds can't be installed, skipping installation.")
    );
    process.exit(0);
  }

  async function getDeviceInfo(deviceId: string): Promise<{
    name: string;
    model: string;
    isWearOS: boolean;
    osVersion: string;
    apiLevel: string;
    deviceId: string;
  } | null> {
    try {
      const model = (
        await executeCommand(adbExe, [
          "-s",
          deviceId,
          "shell",
          "getprop",
          "ro.product.model",
        ])
      ).stdout
        .toString()
        .trim();

      const characteristics = (
        await executeCommand(adbExe, [
          "-s",
          deviceId,
          "shell",
          "getprop",
          "ro.build.characteristics",
        ])
      ).stdout
        .toString()
        .trim();

      const osVersion = (
        await executeCommand(adbExe, [
          "-s",
          deviceId,
          "shell",
          "getprop",
          "ro.build.version.release",
        ])
      ).stdout
        .toString()
        .trim();

      const apiLevel = (
        await executeCommand(adbExe, [
          "-s",
          deviceId,
          "shell",
          "getprop",
          "ro.build.version.sdk",
        ])
      ).stdout
        .toString()
        .trim();

      // If the property contains "watch", it's a Wear OS device
      return {
        name: model || deviceId,
        model: model,
        isWearOS: characteristics.includes("watch"),
        osVersion: osVersion,
        apiLevel: apiLevel,
        deviceId: deviceId,
      };
    } catch (error) {
      console.error("Error checking device properties:", error);
      return null;
    }
  }

  // Installation
  const spinner = await progressIndicator("Installing...");
  const devicesResult = (await executeCommand(adbExe, ["devices"])).stdout
    .toString()
    .trim()
    .split("\n")
    .slice(1);
  const devices = devicesResult
    .filter((line) => line && !line.includes("offline"))
    .map((line) => line.split("\t")[0]);

  if (devices.length === 0) {
    spinner.updateMessage(chalk.red("No devices connected."));
    spinner.stop(false);
    process.exit(5);
  }

  const compatibleDevices = await Promise.all(
    devices.map(async (device) => {
      return await getDeviceInfo(device);
    })
  );
  const onlyCompatibleDevices = compatibleDevices.filter(
    (e) => e?.isWearOS && !allDevices
  );

  let targetDevice = devices[0];
  if (
    devices.length > 1 &&
    !allDevices &&
    compatibleDevices.every((device) => !device?.isWearOS)
  ) {
    spinner.updateMessage(chalk.red("No compatible Wear OS devices found."));
    process.exit(5);
  } else if (onlyCompatibleDevices.length == 1) {
    targetDevice = onlyCompatibleDevices[0]!.deviceId;
  } else if (devices.length > 1) {
    if (nonInteractive) {
      // Resolve the first compatible one
      targetDevice = onlyCompatibleDevices[0]?.deviceId || devices[0];
    } else {
      spinner.pause();
      const answers = await inquirer.prompt([
        {
          type: "list",
          name: "device",
          message: "Multiple devices found. Select a device to run on:",
          choices: devices.map((device, index) => {
            const info = compatibleDevices[index];
            return {
              name: `Device ${index + 1}: ${
                info?.name != null ? `${info?.name} (${device})` : device
              }${info?.isWearOS ? "" : " (incompatible)"}`,
              value: device,
              disabled: !info?.isWearOS && !allDevices,
              // Doesn't look good in the list
              // description: // TODO: only show if Wear OS
              //   info?.osVersion != null
              //     ? `Wear OS ${info.osVersion} (API ${info.apiLevel})`
              //     : "",
            };
          }),
        },
      ]);
      spinner.resume();
      targetDevice = answers.device;
    }
  }

  try {
    await executeCommand(adbExe, [
      "-s",
      targetDevice,
      "install",
      "watchface/build/outputs/apk/debug/watchface-debug.apk",
    ]);
    await executeCommand(adbExe, [
      "-s",
      targetDevice,
      "shell",
      "am",
      "broadcast",
      "-a",
      "com.google.android.wearable.app.DEBUG_SURFACE",
      "--es",
      "operation",
      "set-watchface",
      "--es",
      "watchFaceId",
      watchFaceId,
    ]);
    spinner.updateMessage("Installation successful.");
    spinner.stop(true);
    process.exit(0);
  } catch (error: any) {
    console.error("Installation failed.");
    console.error(error);
    process.exit(5);
  }
}
