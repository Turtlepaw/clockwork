import path from "path";
import { executeCommand } from "./command";
import { PACKAGE_JSON_NAME } from "./constants";

export interface Package {
  url: string;
  version: string;
  repoName: string;
}

interface GetPackages {
  packages: Package[];
  isPackageInstalled: (pkgName: string) => boolean;
  getPackagePath: (pkgName: string) => string;
}

export function parsePackage(packageUrl: string): Package {
  // Parse the package e.g. https://github.com/owner/repo.git@latest
  // @latest defines the release tag (optional)
  const parts = packageUrl.split("@");
  const url = parts[0];
  const version = parts[1] || "latest";
  const repoName = path.basename(url, ".git");
  return { url, version, repoName };
}

export function parseDependency(pkg: any): Package {
  // Parse the package e.g. { version: "latest", url: "..." }
  const url = pkg.url;
  const version = pkg.version || "latest";
  const repoName = path.basename(url, ".git");
  return { url, version, repoName };
}

export function getPackages(): GetPackages {
  const packageJson = require(path.join(process.cwd(), PACKAGE_JSON_NAME));
  const packages: Package[] = packageJson.dependencies
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
export function getLatestTag(repoUrl: string): string {
  try {
    const tags = executeCommand(`git`, ["ls-remote", "--tags", repoUrl])
      .stdout.toString()
      .split("\n")
      .map((line) => line.split("/").pop())
      .filter((tag) => tag)
      .sort((a, b) => (a! > b! ? -1 : 1));
    if (tags[0] == null) throw Error("Failed to get latest tag");
    return tags[0];
  } catch (error) {
    console.error(`Failed to get tags from ${repoUrl}:`, error);
    return "latest";
  }
}
