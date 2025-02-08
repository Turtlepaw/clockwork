// scripts/build-watchface.ts
import { exec, execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import inquirer from "inquirer";
import chalk from "chalk"; // For colored text
import build from "./build";
import {
  errors,
  initMessage,
  progressIndicator,
  Spinner,
  updater,
  validateClockworkPackage,
  verifyInstallationPath,
} from "./utils";
import {
  getDefaultBranch,
  getLatestTag,
  parseDependency,
  parsePackage,
  readPackageFile,
  writePackageFile,
  executePostScripts,
} from "./package";
import { executeCommand } from "./command";
import { PACKAGE_JSON_NAME, PACKAGE_JSON_NAMES } from "./constants";
import jsYaml from "js-yaml";
import { Dependency, PackageFile } from "./types/package";

// get version from PACKAGE_JSON_NAME
const VERSION = "__VERSION__";
const commands: Record<string, string[]> = {
  install: ["i", "install"],
  add: ["add"],
  build: ["build"],
  init: ["init", "initialize"],
  packages: ["packages"],
  upgrade: ["upgrade"],
  update: ["update"],
  uninstall: ["uninstall", "remove"],
};

const commandInfo: Record<string, string> = {
  install: "Install a package from a git repository",
  add: `Add a package to the ${PACKAGE_JSON_NAME} file`,
  build: "Build the watch face",
  init: `Initialize the ${PACKAGE_JSON_NAME} file for the project`,
  packages: "List all installed packages",
  upgrade: "Upgrade installed packages to their latest versions",
  uninstall: "Uninstall a package",
  update: "Update installed packages",
};

function resolveVersion(version: string, latest: string) {
  if (version == "latest") {
    return latest;
  } else return version;
}

async function addPackage(
  packageStr: string,
  moduleFolder: string,
  cwd: string,
  spinner: Spinner
): Promise<boolean> {
  try {
    spinner.updateMessage(`Installing package...`);

    if (!packageStr) {
      spinner.stop(false);
      throw new Error("Please provide a package to add.");
    }

    let latestTag;

    if (!packageStr.startsWith("https://")) {
      const registryUrl =
        "https://raw.githubusercontent.com/Turtlepaw/clockwork/refs/heads/main/registry.yml";

      let registryContent;
      try {
        const response = await fetch(registryUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        registryContent = await response.text();
      } catch (err: any) {
        spinner.stop(false);
        throw new Error(`Failed to fetch registry: ${err.message}`);
      }

      let registry;
      try {
        registry = jsYaml.load(registryContent) as Record<string, Dependency>;
      } catch (err: any) {
        spinner.stop(false);
        throw new Error(`Error parsing registry: ${err.message}`);
      }

      const packageInfo = registry[packageStr];
      if (!packageInfo) {
        spinner.stop(false);
        throw new Error(
          `Package ${packageStr} not found in the registry.\n\n💡 See https://clockwork-pkg.pages.dev/guides/packages#packages-in-the-registry for the registry\n🔗 If you meant to use a git URL, make sure it starts with "https://"`
        );
      }
      packageStr = packageInfo.url;
      if (packageInfo.version != null) latestTag = packageInfo.version;
    }

    const latestGitTag = await getLatestTag(packageStr);
    if (latestGitTag != null && latestTag == null) {
      latestTag = latestGitTag;
    } else if (latestGitTag == null && latestTag == null) {
      spinner.pause();
      const answer = await inquirer.prompt([
        {
          type: "confirm",
          name: "downloadSource",
          message: "No tags for this package. Install default branch instead?",
          default: false,
        },
      ]);
      spinner.resume();

      if (!answer.downloadSource) {
        spinner.stop(false);
        console.log(chalk.red("Installation aborted. No tags available."));
        process.exit(1);
      }

      latestTag = await getDefaultBranch(packageStr);
    }

    if (!latestTag) {
      spinner.stop(false);
      throw new Error("Failed to get latest tag.");
    }

    const {
      url: packageUrl,
      version: _version,
      repoName,
    } = parsePackage(packageStr);
    const version = resolveVersion(_version, latestTag);

    await installPackage(packageUrl, moduleFolder, cwd, spinner, version);

    spinner.updateMessage(`Adding package to ${PACKAGE_JSON_NAME}...`);

    let pkg: PackageFile;
    try {
      pkg = readPackageFile();
    } catch (err: any) {
      spinner.stop(false);
      throw new Error(`Failed to read ${PACKAGE_JSON_NAME}: ${err.message}`);
    }

    pkg.dependencies = pkg.dependencies || {};
    pkg.dependencies[repoName] = { version, url: packageUrl };

    writePackageFile(pkg);
    spinner.stop(true);

    const packageFolder = path.join(moduleFolder, repoName);
    try {
      const packageFile = await validateClockworkPackage(packageFolder);
      const packageJson = readPackageFile(packageFile);
      if (packageJson.watchFaceFormatVersion !== pkg.watchFaceFormatVersion) {
        console.warn(
          chalk.yellow(
            `Package ${repoName} isn't compatible with this watch face format version.`
          )
        );
      }

      // Run post-install scripts
      await executePostScripts(packageJson, "postinstall", packageFolder);
    } catch (err: any) {
      spinner.stop(false);
      throw new Error(
        `Failed to read module's package file: ${err.message}\n\n💡 Are you sure it's compatible with Clockwork?`
      );
    }

    console.log(chalk.green(`Package ${repoName} added successfully.`));
    return process.exit(0);
  } catch (err: any) {
    spinner.stop(false);
    console.error(chalk.red(`Error: ${err.message}`));
    return process.exit(1);
  }
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
    const { url: packageUrl, repoName, version } = parseDependency(pkg);
    const packagePath = path.join(moduleFolder, repoName);

    if (fs.existsSync(packagePath)) {
      try {
        spinner.updateMessage(`Updating ${repoName}...`);

        // Check if package exists and get its remote URL
        const currentUrl = (
          await executeCommand(
            "git",
            ["config", "--get", "remote.origin.url"],
            {
              cwd: packagePath,
            }
          )
        ).stdout
          .toString()
          .trim();

        // If URLs don't match, remove the package and reinstall
        if (currentUrl !== packageUrl) {
          spinner.updateMessage(`URL changed for ${repoName}, reinstalling...`);
          fs.rmSync(packagePath, { recursive: true, force: true });
          await installPackage(packageUrl, moduleFolder, cwd, spinner, version);
          continue;
        }

        // Fetch all remotes and tags first
        await executeCommand(`git`, ["fetch", "--all", "--tags"], {
          cwd: packagePath,
        });

        // Get latest tag before attempting checkout
        const latestTag = await getLatestTag(packageUrl);
        const defaultBranch = await getDefaultBranch(packageUrl);

        // Only attempt version checkout if tag exists
        try {
          await executeCommand(`git`, ["checkout", version], {
            cwd: packagePath,
          });

          await executeCommand(`git`, ["pull", "origin", version], {
            cwd: packagePath,
          });
        } catch (err) {
          spinner.updateMessage(
            `Warning: Could not checkout version ${version} for ${repoName}, using current version`
          );
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        if (
          latestTag != null &&
          version != defaultBranch &&
          latestTag !== version
        ) {
          const [latestMajor, latestMinor, latestPatch] = latestTag.split(".");
          const [currentMajor, currentMinor, currentPatch] = version.split(".");

          const majorUpgrade = latestMajor !== currentMajor;
          const minorUpgrade = latestMinor !== currentMinor;
          const patchUpgrade = latestPatch !== currentPatch;

          const canUpgrade = majorUpgrade
            ? upgrade
            : minorUpgrade || patchUpgrade;

          if (canUpgrade) {
            try {
              await executeCommand(`git`, ["checkout", latestTag], {
                cwd: packagePath,
              });
              packageJson.dependencies[repoName].version = latestTag;
              spinner.updateMessage(`Updated ${repoName} to ${latestTag}`);
              await new Promise((resolve) => setTimeout(resolve, 1000));
            } catch (err) {
              spinner.updateMessage(
                `Warning: Could not upgrade ${repoName} to ${latestTag}`
              );
              await new Promise((resolve) => setTimeout(resolve, 2000));
              if (majorUpgrade) updatable.push(repoName);
            }
          } else if (majorUpgrade) {
            updatable.push(repoName);
          }
        }

        try {
          const packageFile = await validateClockworkPackage();
          const packageJson = readPackageFile(packageFile);
          if (
            packageJson.watchFaceFormatVersion !== pkg.watchFaceFormatVersion
          ) {
            console.warn(
              chalk.yellow(
                `Package ${repoName} isn't compatible with this watch face format version.`
              )
            );
          }

          // Run post-update scripts
          await executePostScripts(
            packageJson,
            "postupdate",
            packagePath,
            spinner
          );
        } catch (err: any) {
          spinner.stop(false);
          throw new Error(
            `Failed to read module's package file: ${err.message}\n\n💡 Are you sure it's compatible with Clockwork?`
          );
        }
      } catch (error: any) {
        spinner.updateMessage(`Failed to update ${repoName}: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
    } else {
      // If the package isn't found, install it
      await installPackage(packageUrl, moduleFolder, cwd, spinner);
    }
  }

  // Efficiently update PACKAGE_JSON_NAME
  writePackageFile(packageJson);

  spinner.updateMessage(
    `Packages up to date, ${
      updatable.length
    } can be upgraded with ${chalk.blueBright("clockwork upgrade")}.`
  );
  spinner.stop(true);
}

async function uninstallPackage(packageName: string, moduleFolder: string) {
  const spinner = await progressIndicator(`Uninstalling package...`);

  try {
    // Read package file
    const packageJson = readPackageFile();

    if (!packageJson.dependencies || !packageJson.dependencies[packageName]) {
      spinner.stop(false);
      throw new Error(`Package ${packageName} is not installed.`);
    }

    // Remove package directory
    const packagePath = path.join(moduleFolder, packageName);
    if (fs.existsSync(packagePath)) {
      fs.rmSync(packagePath, { recursive: true, force: true });
    }

    // Remove from dependencies
    delete packageJson.dependencies[packageName];
    writePackageFile(packageJson);

    spinner.stop(true);
    console.log(
      chalk.green(`Package ${packageName} uninstalled successfully.`)
    );
    return true;
  } catch (err: any) {
    spinner.stop(false);
    console.error(chalk.red(`Error: ${err.message}`));
    return false;
  }
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
  await verifyInstallationPath();
  if (!version) await updater(debugMode, VERSION);

  // If user ran clockwork --version
  if (version) {
    console.log(VERSION);
    return;
  }

  // If user ran clockwork install <repo>
  if (isCommand(commands.install)) {
    await validateClockworkPackage();
    const repo = args[1];
    const spinner = await progressIndicator(`Installing packages...`);
    if (repo) {
      await addPackage(repo, moduleFolder, cwd, spinner);
    }

    // Check if there are any updates for packages in PACKAGE_JSON_NAME
    const packageJson = readPackageFile();
    const pkgs = Object.values(packageJson.dependencies || {});
    await getUpdates(pkgs, moduleFolder, cwd, packageJson);

    spinner.stop();
    return;
  } else if (isCommand(commands.upgrade)) {
    await validateClockworkPackage();
    // Check if there are any updates for packages in PACKAGE_JSON_NAME
    const packageJson = readPackageFile();
    const pkgs = Object.values(packageJson.dependencies || {});
    await getUpdates(pkgs, moduleFolder, cwd, packageJson, true);
    return;
  } else if (isCommand(commands.update)) {
    await validateClockworkPackage();
    const packageJson = readPackageFile();
    const pkgs = Object.values(packageJson.dependencies || {});
    await getUpdates(pkgs, moduleFolder, cwd, packageJson, false);
    return;
  } else if (isCommand(commands.add)) {
    await validateClockworkPackage();
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
    await validateClockworkPackage();
    build();
    return;
  } else if (isCommand(commands.packages)) {
    await validateClockworkPackage();
    const packageJson = readPackageFile();
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
    // create PACKAGE_JSON_NAME
    fs.writeFileSync(path.join(PACKAGE_JSON_NAME), "");

    const packageJson = {
      name: projectName,
      version: "1.0.0",
      description: "",
    };
    writePackageFile(packageJson);
    spinner.stop();
  } else if (isCommand(commands.uninstall)) {
    await validateClockworkPackage();

    const packageName = args[1];
    if (!packageName) {
      console.error(chalk.red("Please specify a package to uninstall."));
      return;
    }

    await uninstallPackage(packageName, moduleFolder);
    return;
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
