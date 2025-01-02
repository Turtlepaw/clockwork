// scripts/build-watchface.ts
import { exec, execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import inquirer from "inquirer";
import chalk from "chalk"; // For colored text
import build from "./build";
import { errors, initMessage, updater } from "./utils";
import {
  getLatestTag,
  Package,
  parseDependency,
  parsePackage,
} from "./package";
import { executeCommand } from "./command";
import { PACKAGE_JSON_NAME } from "./constants";
import jsYaml from "js-yaml";

// get version from package.json
const VERSION = "__VERSION__";
const commands: Record<string, string[]> = {
  install: ["i", "install"],
  add: ["add"],
  build: ["build"],
  init: ["init", "initialize"],
  packages: ["packages"],
  upgrade: ["upgrade"],
};

const commandInfo: Record<string, string> = {
  install: "Install a package from a git repository",
  add: `Add a package to the ${PACKAGE_JSON_NAME} file`,
  build: "Build the watch face",
  init: `Initialize the ${PACKAGE_JSON_NAME} file for the project`,
  packages: "List all installed packages",
  upgrade: "Upgrade installed packages",
};

interface Spinner {
  stop: (isSuccess?: boolean) => void;
  updateMessage: (message: string) => void;
}

// Custom spinner function
async function progressIndicator(taskName: string): Promise<Spinner> {
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

function resolveVersion(version: string, latest: string) {
  console.log(version, latest);
  console.log(version == "latest");
  if (version == "latest") {
    return latest;
  } else return version;
}

async function addPackage(
  packageStr: string,
  moduleFolder: string,
  cwd: string,
  spinner: Spinner
) {
  spinner.updateMessage(`Installing package...`);
  // Check if url is provided
  if (!packageStr) {
    spinner.stop(false);
    throw new Error("Please provide a package to add.");
  } else if (!packageStr.startsWith("https://")) {
    // Resolve from manifest: https://raw.githubusercontent.com/Turtlepaw/clockwork/refs/heads/main/manifest.yml
    const manifestUrl =
      "https://raw.githubusercontent.com/Turtlepaw/clockwork/refs/heads/main/manifest.yml";
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      spinner.stop(false);
      throw new Error(`Failed to fetch manifest from ${manifestUrl}`);
    }
    const manifestContent = await response.text();
    const manifest = jsYaml.load(manifestContent) as Record<string, Package>;
    const packageInfo = manifest[packageStr];
    if (!packageInfo) {
      spinner.stop(false);
      throw new Error(`Package ${packageStr} not found in manifest.`);
    }
    packageStr = packageInfo.url;
  }

  const latestTag = getLatestTag(packageStr);
  const {
    url: packageUrl,
    version: _version,
    repoName,
  } = parsePackage(packageStr);
  const version = resolveVersion(_version, latestTag);
  console.log("Installing " + version);

  await installPackage(packageUrl, moduleFolder, cwd, spinner, version);

  // Add to package.json
  spinner.updateMessage(`Adding package to ${PACKAGE_JSON_NAME}...`);
  const packageJson = require(path.join(cwd, PACKAGE_JSON_NAME));
  packageJson.dependencies = packageJson.dependencies || {};
  // Specify the package version and url
  packageJson.dependencies[repoName] = {
    version: version,
    url: packageUrl,
  };
  fs.writeFileSync(
    path.join(cwd, PACKAGE_JSON_NAME),
    JSON.stringify(packageJson, null, 2)
  );
}

async function installPackage(
  packageStr: string,
  moduleFolder: string,
  cwd: string,
  spinner: Spinner,
  version: string = "latest"
) {
  const { url: packageUrl, repoName } = parsePackage(packageStr);
  const packagePath = path.join(moduleFolder, repoName);

  // Remove the existing directory if it exists
  if (fs.existsSync(packagePath)) {
    fs.rmSync(packagePath, { recursive: true, force: true });
  }

  spinner.updateMessage(`Cloning ${packageUrl}...`);

  try {
    // Use spawnSync instead of execSync for better cross-platform support
    executeCommand(
      "git",
      ["clone", "--branch", version, packageUrl, packagePath],
      { cwd }
    );
  } catch (error: any) {
    spinner.stop(false);
    if (error.code === "ENOENT") {
      throw new Error(
        "Git is not installed or not available in PATH. Please install Git and try again."
      );
    }
    throw error;
  }

  spinner.stop();
}

async function getUpdates(
  pkgs: any[],
  moduleFolder: string,
  cwd: string,
  packageJson: any,
  upgrade: boolean = false
) {
  const spinner = await progressIndicator(`Updating packages...`);
  let updatable = [];

  for (const pkg of pkgs) {
    const { url: packageUrl, repoName, version } = parsePackage(pkg);
    const packagePath = path.join(moduleFolder, repoName);
    if (fs.existsSync(packagePath)) {
      // Pull the latest changes for the specified package
      executeCommand(`git`, ["pull"], { cwd: packagePath });
      // Check if package has newer tag
      const latestTag = getLatestTag(packageUrl);
      if (latestTag !== version) {
        // Check if new tag is a major upgrade
        const majorUpgrade = latestTag.split(".")[0] !== version.split(".")[0];
        const canUpgrade = upgrade && majorUpgrade;
        // Set the git tag to the latest version if not major upgrade
        if (canUpgrade) {
          packageJson.dependencies[repoName].version = latestTag;
          executeCommand(`git`, ["checkout", latestTag], { cwd: packagePath });
        } else {
          updatable.push(repoName);
        }
      }
    } else {
      // If the package isn't found, install it
      await installPackage(packageUrl, moduleFolder, cwd, spinner);
    }
  }

  // Efficiently update package.json
  fs.writeFileSync(
    path.join(cwd, PACKAGE_JSON_NAME),
    JSON.stringify(packageJson, null, 2)
  );

  spinner.updateMessage(
    `Packages up to date, ${updatable.length} can be upgraded.`
  );
  spinner.stop(true);
}

function isCommand(commands: string[]): boolean {
  // Check if current command run is in commands
  return commands.includes(process.argv[2]);
}

export default async function main() {
  const moduleFolder = path.join(".", "packages");
  if (!fs.existsSync(moduleFolder)) {
    fs.mkdirSync(moduleFolder);
  }

  const env = process.env;
  const cwd = process.cwd();
  const args = process.argv.slice(2);
  const debugMode = args.includes("--debug");
  const version = args.includes("--version");

  initMessage(VERSION);
  if (!version) await updater(debugMode, VERSION);

  // If user ran clockwork --version
  if (version) {
    console.log(VERSION);
    return;
  }

  // If user ran clockwork install <repo>
  if (isCommand(commands.install)) {
    if (!fs.existsSync(path.join(cwd, PACKAGE_JSON_NAME))) {
      errors.notInitialized();
      return;
    }
    const repo = args[1];
    const spinner = await progressIndicator(`Installing packages...`);
    if (repo) {
      await addPackage(repo, moduleFolder, cwd, spinner);
    }

    // Check if there are any updates for packages in package.json
    const packageJson = require(path.join(cwd, PACKAGE_JSON_NAME));
    const pkgs = Object.values(packageJson.dependencies || {});
    await getUpdates(pkgs, moduleFolder, cwd, packageJson);

    spinner.stop();
    return;
  } else if (isCommand(commands.upgrade)) {
    if (!fs.existsSync(path.join(cwd, PACKAGE_JSON_NAME))) {
      errors.notInitialized();
      return;
    }
    // Check if there are any updates for packages in package.json
    const packageJson = require(path.join(cwd, PACKAGE_JSON_NAME));
    const pkgs = Object.values(packageJson.dependencies || {});
    await getUpdates(pkgs, moduleFolder, cwd, packageJson, true);
    return;
  } else if (isCommand(commands.add)) {
    // Check if package.json exists
    if (!fs.existsSync(path.join(cwd, PACKAGE_JSON_NAME))) {
      errors.notInitialized();
      return;
    }
    // If user ran clockwork add <repo>
    const repo = args[1];
    const spinner = await progressIndicator(`Adding packages...`);
    if (repo) {
      await addPackage(repo, moduleFolder, cwd, spinner);
      spinner.stop();
    } else {
      spinner.updateMessage(`Please specify a package to add.`);
      spinner.stop(false);
    }
    return;
  } else if (isCommand(commands.build)) {
    if (!fs.existsSync(path.join(cwd, PACKAGE_JSON_NAME))) {
      errors.notInitialized();
      return;
    }
    build();
    return;
  } else if (isCommand(commands.packages)) {
    if (!fs.existsSync(path.join(cwd, PACKAGE_JSON_NAME))) {
      errors.notInitialized();
      return;
    }
    const packageJson = require(path.join(cwd, PACKAGE_JSON_NAME));
    console.log(chalk.green.bold("Installed packages:"));
    for (const pkg of Object.values(packageJson.dependencies || {})) {
      const { repoName, version } = parseDependency(pkg);
      console.log(`  • ${repoName}${chalk.gray(`@${version}`)}`);
    }
    return;
  } else if (isCommand(commands.init)) {
    // If user ran clockwork init
    const { projectName } = await inquirer.prompt([
      {
        type: "input",
        name: "projectName",
        message: "Enter the project name:",
        default: process.cwd().split(path.sep).pop(),
      },
    ]);
    const spinner = await progressIndicator(
      `Initializing ${PACKAGE_JSON_NAME}...`
    );
    const packageJson = {
      name: projectName,
      version: "1.0.0",
      description: "",
    };
    fs.writeFileSync(
      path.join(cwd, PACKAGE_JSON_NAME),
      JSON.stringify(packageJson, null, 2)
    );
    spinner.stop();
  } else {
    console.log("Usage: clockwork <command>");
    console.log("Commands:");
    for (const [command, aliases] of Object.entries(commands)) {
      console.log(
        `  ${chalk.green(aliases.join(", "))} - ${commandInfo[command]}`
      );
    }
    return;
  }
}
