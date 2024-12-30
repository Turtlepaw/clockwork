// scripts/build-watchface.ts
import { exec, execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import inquirer from "inquirer";
import chalk from "chalk"; // For colored text
import build from "./build";
import { initMessage, updater } from "./utils";
import { parsePackage } from "./package";

// get version from package.json
const VERSION = "__VERSION__";
const commands: Record<string, string[]> = {
  install: ["i", "install"],
  add: ["add"],
  build: ["build"],
  init: ["init", "initialize"],
};

const commandInfo: Record<string, string> = {
  install: "Install a package from a git repository",
  add: "Add a package to the package.json file",
  build: "Build the watch face",
  init: "Initialize the package.json file for the project",
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

async function addPackage(
  packageStr: string,
  moduleFolder: string,
  cwd: string,
  spinner: Spinner
) {
  spinner.updateMessage(`Installing package...`);
  const { url: packageUrl, tag, repoName } = parsePackage(packageStr);
  await installPackage(packageUrl, moduleFolder, cwd, spinner);

  // Add to package.json
  spinner.updateMessage(`Adding package to package.json...`);
  const packageJson = require(path.join(cwd, "package.json"));
  packageJson.dependencies = packageJson.dependencies || {};
  // Specify the package version and url
  packageJson.dependencies[repoName] = packageUrl + "@latest";
  fs.writeFileSync(
    path.join(cwd, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );
}

async function installPackage(
  packageStr: string,
  moduleFolder: string,
  cwd: string,
  spinner: Spinner
) {
  const { url: packageUrl, repoName } = parsePackage(packageStr);
  const packagePath = path.join(moduleFolder, repoName);

  // Remove the existing directory if it exists
  if (fs.existsSync(packagePath)) {
    fs.rmSync(packagePath, { recursive: true, force: true });
  }

  spinner.updateMessage(`Cloning ${packageUrl}...`);
  // Clone the repo into the packages folder
  execSync(`git clone ${packageUrl} ${packagePath}`, {
    cwd,
  });

  spinner.stop();
}

async function getUpdates(
  packageStr: string,
  moduleFolder: string,
  cwd: string
) {
  const { url: packageUrl, tag, repoName } = parsePackage(packageStr);
  const spinner = await progressIndicator(`Updating packages...`);
  spinner.updateMessage(`Updating ${packageUrl}...`);

  // Check if the specified package folder exists
  const packagePath = path.join(moduleFolder, repoName);
  if (fs.existsSync(packagePath)) {
    // Pull the latest changes for the specified package
    execSync(`git pull`, { cwd: packagePath });
    spinner.stop();
  } else {
    // If the package isn't found, install it
    await installPackage(packageUrl, moduleFolder, cwd, spinner);
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
  if (!version) updater(debugMode, VERSION);

  // If user ran clockwork --version
  if (version) {
    console.log(VERSION);
    return;
  }

  // If user ran clockwork install <repo>
  if (isCommand(commands.install)) {
    const repo = args[1];
    const spinner = await progressIndicator(`Installing packages...`);
    if (repo) {
      await addPackage(repo, moduleFolder, cwd, spinner);
    }

    // Check if there are any updates for packages in package.json
    const packageJson = require(path.join(cwd, "package.json"));
    const packages = Object.keys(packageJson.dependencies || {});
    for (const packageStr of packages) {
      await getUpdates(packageStr, moduleFolder, cwd);
    }

    spinner.stop();
    return;
  } else if (isCommand(commands.add)) {
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
    build();
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
    const spinner = await progressIndicator(`Initializing package.json...`);
    const packageJson = {
      name: projectName,
      version: "1.0.0",
      description: "",
    };
    fs.writeFileSync(
      path.join(cwd, "package.json"),
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
