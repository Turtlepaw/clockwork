import path from "path";
import { executeCommand } from "./command";
import { PACKAGE_JSON_NAME, PACKAGE_JSON_NAMES } from "./constants";
import jsYaml from "js-yaml";
import fs from "fs";
import { progressIndicator, Spinner } from "./utils";
import { PackageFile } from "./types/package";
import chalk from "chalk";

export interface ParsedPackage {
  url: string;
  version: string;
  repoName: string;
}

interface GetPackages {
  packages: ParsedPackage[];
  isPackageInstalled: (pkgName: string) => boolean;
  getPackagePath: (pkgName: string) => string;
}

/**
 * @deprecated uses old package format
 */
export function parsePackage(packageUrl: string): ParsedPackage {
  // Parse the package e.g. https://github.com/owner/repo.git@latest
  // @latest defines the release tag (optional)
  if (typeof packageUrl === "object" && "url" in packageUrl) {
    return parseDependency(packageUrl);
  }
  const parts = packageUrl.split("@");
  const url = parts[0];
  const version = parts[1] || "latest";
  const repoName = path.basename(url, ".git");
  return { url, version, repoName };
}

export function parseDependency(pkg: any): ParsedPackage {
  // Parse the package e.g. { version: "latest", url: "..." }
  const url = pkg.url;
  const version = pkg.version || "latest";
  const repoName = path.basename(url, ".git");
  return { url, version, repoName };
}

export function getPackages(): GetPackages {
  const packageJson = readPackageFile();
  const packages: ParsedPackage[] = packageJson.dependencies
    ? Object.values(packageJson.dependencies).map((pkg: unknown) =>
        parseDependency(pkg as string)
      )
    : [];
  return {
    packages,
    isPackageInstalled: (pkgName: string) => {
      return packages.some((pkg) => pkg.repoName === pkgName);
    },
    getPackagePath: (pkgName: string) =>
      path.join(process.cwd(), "packages", pkgName),
  };
}

/**
 * Gets the latest tag from a git repository
 */
export async function getLatestTag(repoUrl: string): Promise<string | null> {
  try {
    const tags = (
      await executeCommand(`git`, ["ls-remote", "--tags", repoUrl])
    ).stdout
      .toString()
      .split("\n")
      .map((line) => line.split("/").pop())
      .filter((tag) => tag)
      .sort((a, b) => (a! < b! ? 1 : -1));
    if (tags[0] == null) return null;
    return tags[0];
  } catch (error) {
    console.error(`Failed to get tags from ${repoUrl}:`, error);
    return "latest";
  }
}

// Function to get the default branch of a repository
export async function getDefaultBranch(repoUrl: string): Promise<string> {
  try {
    const output = (
      await executeCommand(`git`, ["ls-remote", "--symref", repoUrl, "HEAD"])
    ).stdout
      .toString()
      .split("\n")
      .find((line) => line.includes("ref: refs/heads/"))
      ?.split(" ")
      .pop();
    return (
      output?.replace("refs/heads/", "")?.replace("HEAD", "").trim() || "main"
    );
  } catch (error) {
    console.error(`Failed to get default branch from ${repoUrl}:`, error);
    return "main";
  }
}

/**
 * Reads the package file and returns the package info
 *
 * @returns the package info
 */
export function readPackageFile(packageFile?: string): PackageFile {
  const names = packageFile ? [packageFile] : PACKAGE_JSON_NAMES;
  // Try both extensions
  for (const filename of names) {
    if (fs.existsSync(filename)) {
      const pkgStr = fs.readFileSync(filename, "utf8");
      try {
        return jsYaml.load(pkgStr) as PackageFile;
      } catch (err: any) {
        throw new Error(`Error parsing ${filename}: ${err.message}`);
      }
    }
  }
  throw new Error(
    `No package file found. Expected one of: ${PACKAGE_JSON_NAMES.join(", ")}`
  );
}

/**
 * Writes the package file.
 *
 * @returns true if the file was written successfully
 */
export function writePackageFile(input: PackageFile): boolean {
  //if (!fs.existsSync(PACKAGE_JSON_NAME)) return false;
  const names = PACKAGE_JSON_NAMES;

  const dump = jsYaml.dump(input);

  // Attempt to write to all possible filenames
  for (const filename of names) {
    if (fs.existsSync(filename)) {
      try {
        fs.writeFileSync(filename, dump);
        return true;
      } catch (err: any) {
        throw new Error(`Error writing ${PACKAGE_JSON_NAME}: ${err.message}`);
      }
    }
  }

  throw new Error(`Error writing ${PACKAGE_JSON_NAME}: No file found`);
}

/**
 * Executes post-update scripts if they exist
 */
export async function executePostScripts(
  packageJson: PackageFile,
  type: "postupdate" | "postinstall",
  workingDir: string,
  _spinner?: Spinner
) {
  const script = packageJson.scripts?.[type];
  if (script) {
    if (!_spinner) {
      _spinner = await progressIndicator(`Running ${type} script...`);
    } else {
      _spinner.updateMessage(`Running ${type} script...`);
    }

    try {
      const isWindows = process.platform === "win32";
      const shell = isWindows ? "cmd" : "sh";
      const shellFlag = isWindows ? "/c" : "-c";
      await executeCommand(shell, [shellFlag, script], {
        stdio: "inherit",
        cwd: workingDir,
      });
    } catch (error: any) {
      console.error(
        chalk.red(`Error executing ${type} script:`),
        error.message
      );
    }
  }
}
