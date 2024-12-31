<div align="center"><img src="./assets/wff_banner.png" /></div>

# Clockwork

Clockwork is an open-source package manager for [Google-Samsung Watch Face Format (WFF)](https://developer.android.com/training/wearables/wff) projects. It can download reusable WFF components and build your watch face.

## Prerequisites

This script has only been tested in conjunction with an [_Android Studio_](https://developer.android.com/studio/intro) installation. _Android Studio_ provides an XML editor, Java, gradle, ADB, AVD and command line. If you don't want to use _Android Studio_, you'll need to set up a development environment that provides those capabilities.

The script assumes WFF Version 2, and has been tested with SDK 33 and 34 on Wear OS 4 and 5.

You'll need a WFF project folder and files. If you haven't already got one, here are some ways of starting:

- Google's [instructions](https://developer.android.com/training/wearables/wff/setup).

- Google's [samples](https://github.com/android/wear-os-samples/tree/main/WatchFaceFormat).

- Adapt the [WFF Boilerplate repository](https://github.com/gondwanasoft/wff-boilerplate).

- [Samsung's Watch Face Studio](https://developer.samsung.com/watch-face-studio/overview.html). You can extract most files that you need from a `.wfs` file:
  - 'Publish' the project in WFS.
  - Find the resulting `.aab` file in `build\[project]`.
  - Append `.zip` to the `.aab` file's name.
  - From the `.zip`, copy `base\res\raw\watchface.xml`.
  - From the `.zip`, copy necessary resources (_eg_, images) from `base\res\drawable-nodpi-v4`.
  - Copy or create other essential files. If in doubt, refer to the sources above.
  - Restore the `.aab` file's name by removing the `.zip`.
  - Use a code editor to reformat `watchface.xml` to make it easier to read.

## Installation

The install file is the fastest way to setup clockwork, it handles downloading the binary for your platform and adding it to the path.

### Windows

```shell
Invoke-WebRequest -Uri https://raw.githubusercontent.com/Turtlepaw/clockwork/refs/heads/main/install/install.ps1 -UseBasicParsing | Invoke-Expression
```

### Linux/MacOS

```shell
curl -s https://raw.githubusercontent.com/Turtlepaw/clockwork/refs/heads/main/install/install.sh | sudo bash
```

> [!NOTE]
> Manual installation of files in `wff-build-tools` is no longer required

## Usage

### Add a repository

```shell
clockwork add <repo-url>
```

```shell
clockwork install
```

## Building your watch face with Clockwork

### Features

- [XML Preprocessor](https://github.com/gondwanasoft/xml-preprocessor)
- [WFF XML XSD Validator](https://github.com/google/watchface/blob/main/third_party/wff/README.md)
- [Memory footprint evaluator](https://github.com/google/watchface/tree/main/play-validations).

The script can't build signed release bundles suitable for uploading to [Google Play Console](https://play.google.com/console).

### Usage

Connect or start a suitable Wear OS device or AVD. If you're using a physical watch, turn on debugging. The device needs to be accessible via ADB.

> [!WARNING]
> If you're using [XML Preprocessor](https://github.com/gondwanasoft/xml-preprocessor), take precautions against the preprocessor overwriting your `watchface.xml` file.

#### Run the build

From a command prompt, run the following. If there are build-time errors, they'll be reported; otherwise, the watchface will be installed on the connected device.

```shell
clockwork build
```

Installation and runtime errors (_eg_, bad XML, missing resources) can be seen in the logcat against `com.google.wear.watchface.runtime`. If you're not using _Android Studio_, try:

    adb logcat --pid=$(adb shell pidof -s com.google.wear.watchface.runtime)

If you're using [XML Preprocessor](https://github.com/gondwanasoft/xml-preprocessor), `build.bat` will normally delete the `watchface.xml` file it creates if the build is successful. This avoids confusing search results in _Android Studio_ (_etc_). If you want to retain `watchface.xml` (_eg_, to help with debugging), use `build.bat -d`.

#### Command-line Options

- `-d` or `--debug` debug mode: if [XML Preprocessor](https://github.com/gondwanasoft/xml-preprocessor) is being used, passes `-d` to the preprocessor for extra output and retains `watchface.xml` after building the watchface.

- `-r` or `--release`: if true, will run [memory footprint evaluator](https://github.com/google/watchface/tree/main/play-validations) and `gradlew bundleRelease`.

- `-a` or `-all`: allow incompatible (non Wear OS) ADB devices to be install targets

### Limitations

`build.exe` can require the `JAVA_HOME` and `ANDROID_HOME` environment variables to be set correctly. `set-env.bat` simplistically attempts to ensure this. If it fails, set the required variables manually.

`build.exe` can't build signed release bundles suitable for uploading to [Google Play Console](https://play.google.com/console). You can do this as follows:

- If you're using [XML Preprocessor](https://github.com/gondwanasoft/xml-preprocessor), use `build.exe`'s `-d` command-line option to prevent deletion of `watchface.xml`.

- In _Android Studio_, select `Build` > `Build App Bundle(s) / APK(s)` > `Build Bundle(s)`. This should create `watchface\release\watchface-release.aab`. This should be acceptable to [Google Play Console](https://play.google.com/console) if you use _Google Play_ to sign the release.

`build.exe` has only been tested in an environment with _Android Studio_ installed. If you don't want _Android Studio_:

- Any text editor can be used to edit the XML and config files. _Visual Studio Code_ is recommended.

- Instead of using gradle directly, you could use the WFS-provided `bundletool`.

- `adb` is available from WFS installation (_eg_, `%LOCALAPPDATA%\Programs\WatchFaceStudio\tools\window\adb.exe`).

- Android emulators can be run independently of _Android Studio_, but it might be easier to use a real watch.

- [This site](https://nthn.uk/blog/wfs) describes an equivalent process that doesn’t require _Android Studio_.

## Developing Clockwork

### Compiling executables

This guide assumes you have [yarn 4.6](https://yarnpkg.com/) and [Node.js 20](https://www.digitalocean.com/community/tutorials/how-to-install-node-js-on-ubuntu-20-04#option-2-installing-node-js-with-apt-using-a-nodesource-ppa) installed.

1. Install dependencies using yarn

```shell
yarn install
```

2. Build the executable using [@yao/pkg](https://github.com/yao-pkg/pkg) (a fork of @vercel/pkg, which is now archived)

```shell
yarn build
```

#### 🧐 What does this do?

1. Compiles all the Typescript files in `./scripts` to Javascript files in `./build/scripts`
2. Bundles all the compiled javascript files and dependencies into `index.js`
3. Injects the current version found in `./package.json` into `./build/index.js`
4. Packages Node.js and `./build/index.js` into an executable for Linux, Mac OS, and Windows

This makes it work on devices even without Node.js installed!

### Publishing

Executables should be published as a GitHub release so that the auto-updater can automatically update the package. Executables built in the project root will not be published to GitHub, as defined by `.gitignore`.

#### Auto updater

The script automatically checks for updates of itself when running.

For the auto-updater to work, all executables built **must retain the original name given** and be published as assets in a GitHub release. You must also set the `repoOwner` (and `repoName` if needed) for the auto updater to fetch assets from.

## Acknowledgements

- [Google's Watch Face Format Sample repository](https://github.com/android/wear-os-samples/tree/main/WatchFaceFormat)

- [Google's WFF XML XSD Validator](https://github.com/google/watchface/blob/main/third_party/wff/README.md)

- [Google's memory footprint evaluator](https://github.com/google/watchface/tree/main/play-validations)
