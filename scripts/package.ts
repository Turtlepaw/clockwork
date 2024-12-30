import path from "path";

interface Package {
  url: string;
  tag: string;
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
  const tag = parts[1] || "latest";
  const repoName = path.basename(url, ".git");
  return { url, tag, repoName };
}

export function getPackages(): GetPackages {
  const packageJson = require(path.join(process.cwd(), "package.json"));
  const packages: Package[] = packageJson.packages
    ? packageJson.packages.map((pkg: string) => parsePackage(pkg))
    : [];
  return {
    packages,
    isPackageInstalled: (pkgName: string) =>
      packages.some((pkg) => pkg.repoName === pkgName),
    getPackagePath: (pkgName: string) =>
      path.join(process.cwd(), "packages", pkgName),
  };
}
