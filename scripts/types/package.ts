export interface Dependency {
  version: string;
  url: string;
}

export interface PackageScripts {
  postinstall?: string;
  postupdate?: string;
}

enum WatchFaceFormatVersion {
  v1 = "1",
  v2 = "2",
}

export interface PackageFile {
  /**
   * Name used to identify the project
   */
  name: string;
  /**
   * The version of the package file
   */
  version: string;
  /**
   * Optional description of the project
   */
  description: string;
  /**
   * Dependencies of the project.
   */
  dependencies?: Record<string, Dependency>;
  /**
   * Watch face format version. Used to ensure compatibility with dependencies.
   */
  watchFaceFormatVersion?: number | string;
  /**
   * Scripts to be run at various stages of the project lifecycle.
   */
  scripts?: PackageScripts;
}
