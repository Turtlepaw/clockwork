import path from "path";
import { executeCommand } from "./command";
import { PACKAGE_JSON_NAME } from "./constants";
import jsYaml from "js-yaml";
import fs from "fs";
import { progressIndicator } from "./utils";
import { PackageFile } from "./types/package";

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

export function parsePackage(packageUrl: string): ParsedPackage {
  // Parse the package e.g. https://github.com/owner/repo.git@latest
  // @latest defines the release tag (optional)
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
  const packageJson = require(path.join(process.cwd(), PACKAGE_JSON_NAME));
  const packages: ParsedPackage[] = packageJson.dependencies
    ? Object.values(packageJson.dependencies).map((pkg: unknown) =>
        parsePackage(pkg as string)
      )
    : [];
  return {
    packages,
    isPackageInstalled: (pkgName: string) => {
      console.log("pkgName", pkgName);
      console.log(packages, packageJson);
      return packages.some((pkg) => pkg.repoName === pkgName);
    },
    getPackagePath: (pkgName: string) =>
      path.join(process.cwd(), "packages", pkgName),
  };
}

/**
 * Gets the latest tag from a git repository
 */
export function getLatestTag(repoUrl: string): string | null {
  try {
    const tags = executeCommand(`git`, ["ls-remote", "--tags", repoUrl])
      .stdout.toString()
      .split("\n")
      .map((line) => line.split("/").pop())
      .filter((tag) => tag)
      .sort((a, b) => (a! > b! ? -1 : 1));
    if (tags[0] == null) return null;
    return tags[0];
  } catch (error) {
    console.error(`Failed to get tags from ${repoUrl}:`, error);
    return "latest";
  }
}

// Function to get the default branch of a repository
export function getDefaultBranch(repoUrl: string): string {
  try {
    const output = executeCommand(`git`, [
      "ls-remote",
      "--symref",
      repoUrl,
      "HEAD",
    ])
      .stdout.toString()
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
export function readPackageFile(): PackageFile {
  const pkgStr = fs.readFileSync(PACKAGE_JSON_NAME, "utf8");
  try {
    return jsYaml.load(pkgStr) as PackageFile;
  } catch (err: any) {
    throw new Error(`Error parsing ${PACKAGE_JSON_NAME}: ${err.message}`);
  }
}

/**
 * Writes the package file.
 *
 * @returns true if the file was written successfully
 */
export function writePackageFile(input: PackageFile): boolean {
  //if (!fs.existsSync(PACKAGE_JSON_NAME)) return false;

  try {
    const dump = jsYaml.dump(input);
    fs.writeFileSync(PACKAGE_JSON_NAME, dump);
    return true;
  } catch (err: any) {
    throw new Error(`Error writing ${PACKAGE_JSON_NAME}: ${err.message}`);
  }
}
